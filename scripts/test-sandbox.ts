import vm from 'node:vm';
import {
  executeCode,
  extractLineColumn,
  sanitizeForIPC,
  buildSandbox,
  isThenable,
} from '../src/main/sandbox.ts';

interface Test {
  name: string;
  fn: () => void | Promise<void>;
}

const tests: Test[] = [];
function test(name: string, fn: Test['fn']) {
  tests.push({ name, fn });
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error('assertion failed: ' + msg);
}

test('runs simple JS', async () => {
  const r = await executeCode("console.log('hello');", 'javascript');
  assert(r.error === null, JSON.stringify(r.error));
  assert(r.console.length === 1, 'expected 1 log');
  assert(r.console[0]!.level === 'log', 'level');
  assert(r.console[0]!.parts[0] === 'hello', 'content');
});

test('captures all log levels', async () => {
  const r = await executeCode(
    "console.log('a');console.info('b');console.warn('c');console.error('d');console.debug('e');",
    'javascript'
  );
  assert(r.error === null, JSON.stringify(r.error));
  assert(r.console.length === 5, '5 logs');
  assert(r.console[0]!.level === 'log', 'log');
  assert(r.console[1]!.level === 'info', 'info');
  assert(r.console[2]!.level === 'warn', 'warn');
  assert(r.console[3]!.level === 'error', 'error');
  assert(r.console[4]!.level === 'debug', 'debug');
});

test('returns expression value', async () => {
  const r = await executeCode('1 + 2', 'javascript');
  assert(r.error === null, 'no error');
  assert(r.return_value === 3, 'value');
});

test('reports reference error with line:column', async () => {
  const r = await executeCode('x + 1', 'javascript');
  assert(r.error !== null, 'expected error');
  assert(r.error.message.includes('not defined'), 'message');
  assert(r.error.line === 1, 'line');
  assert((r.error.column ?? 0) > 0, 'column');
});

test('sandbox blocks require', async () => {
  const r = await executeCode('typeof require', 'javascript');
  assert(r.return_value === 'undefined', `expected undefined, got ${r.return_value}`);
});

test('sandbox blocks process', async () => {
  const r = await executeCode('typeof process', 'javascript');
  assert(r.return_value === 'undefined', `expected undefined, got ${r.return_value}`);
});

test('sandbox blocks fetch', async () => {
  const r = await executeCode('typeof fetch', 'javascript');
  assert(r.return_value === 'undefined', `expected undefined, got ${r.return_value}`);
});

test('sandbox blocks global', async () => {
  const r = await executeCode('typeof global', 'javascript');
  assert(r.return_value === 'undefined', `expected undefined, got ${r.return_value}`);
});

test('supports TypeScript', async () => {
  const src = 'const x: number = 42; console.log(x);';
  const r = await executeCode(src, 'typescript');
  assert(r.error === null, JSON.stringify(r.error));
  assert(r.console.length === 1, '1 log');
  assert(r.console[0]!.parts[0] === 42, 'value');
});

test('strips TS interfaces', async () => {
  const src = "interface User { name: string; } const u = { name: 'a' }; console.log(u.name);";
  const r = await executeCode(src, 'typescript');
  assert(r.error === null, JSON.stringify(r.error));
  assert(r.console[0]!.parts[0] === 'a', 'value');
});

test('strips TS generics', async () => {
  const src = 'function id<T>(x: T): T { return x; } console.log(id<number>(7));';
  const r = await executeCode(src, 'typescript');
  assert(r.error === null, JSON.stringify(r.error));
  assert(r.console[0]!.parts[0] === 7, 'value');
});

test('supports await with real setTimeout', async () => {
  const r = await executeCode(
    "(async () => { const x = await new Promise(r => setTimeout(r, 50)); console.log(x); })()",
    'javascript'
  );
  assert(r.error === null, JSON.stringify(r.error));
  assert(r.console.length === 1, '1 log');
});

test('syntax error reports line:column', async () => {
  const r = await executeCode('const x =', 'javascript');
  assert(r.error !== null, 'expected error');
  assert(r.error.line !== null || (r.error.stack?.includes(':') ?? false), 'line or stack');
});

test('extractLineColumn handles evalmachine synthetic frames', () => {
  const stack = 'evalmachine.<anonymous>:1:1\n    at eval (vm.js:1:1)';
  const { line, column } = extractLineColumn(stack);
  assert(line === 1, 'line');
  assert(column === 1, 'column');
});

test('extractLineColumn returns nulls on null stack', () => {
  const r = extractLineColumn(null);
  assert(r.line === null, 'line null');
  assert(r.column === null, 'column null');
});

test('isThenable detects promises', () => {
  assert(isThenable(Promise.resolve(1)), 'promise');
  assert(!isThenable({}), 'plain object');
  assert(!isThenable(null), 'null');
  assert(!isThenable(42), 'number');
});

test('buildSandbox returns a context with console', () => {
  const logs: unknown[] = [];
  const sandbox = buildSandbox(logs as never);
  assert(typeof sandbox.console === 'object', 'console');
  assert(typeof sandbox.setTimeout === 'function', 'setTimeout');
});

test('sanitizeForIPC handles circular references', () => {
  const a: Record<string, unknown> = {};
  a.self = a;
  const out = sanitizeForIPC(a);
  assert(typeof out === 'object', 'object');
  assert((out as Record<string, unknown>).self === '[Circular]', 'circular');
});

test('sanitizeForIPC truncates huge objects', () => {
  const big: Record<string, unknown> = {};
  for (let i = 0; i < 5000; i++) big[`k${i}`] = i;
  const out = sanitizeForIPC(big) as Record<string, unknown>;
  const values = Object.values(out);
  assert(values.includes('[Truncated]'), 'truncated marker present');
  assert(values.length < Object.keys(big).length, 'output shorter than input');
});

test('sanitizeForIPC limits depth', () => {
  let deep: Record<string, unknown> = {};
  let cur = deep;
  for (let i = 0; i < 20; i++) {
    cur.next = {};
    cur = cur.next as Record<string, unknown>;
  }
  const out = sanitizeForIPC(deep);
  let hasMarker = false;
  let node: unknown = out;
  while (node && typeof node === 'object') {
    if ((node as Record<string, unknown>).next === '[Max depth]') {
      hasMarker = true;
      break;
    }
    node = (node as Record<string, unknown>).next;
  }
  assert(hasMarker, 'depth marker');
});

test('vm context actually isolates globals', () => {
  const ctx = vm.createContext(buildSandbox([] as never), {
    codeGeneration: { strings: false, wasm: false },
  });
  vm.runInContext('typeof process', ctx);
  assert(
    vm.runInContext('typeof process', ctx) === 'undefined',
    'process is undefined in sandbox'
  );
  assert(
    vm.runInContext('typeof require', ctx) === 'undefined',
    'require is undefined in sandbox'
  );
});

let passed = 0;
let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    console.log(`  ✓ ${t.name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${t.name}: ${(e as Error).message}`);
    failed++;
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);