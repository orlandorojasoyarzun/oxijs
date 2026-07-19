import { uuid, deriveTitle, persistedFromState, isValidPersisted, cloneTabData } from '../src/renderer/src/tab-helpers.js';
import { createTabs } from '../src/renderer/src/tabs.js';

// ---------- localStorage + window mock ----------

const memory = new Map();

const mockStorage = {
  getItem(k) {
    return memory.has(k) ? memory.get(k) : null;
  },
  setItem(k, v) {
    memory.set(k, String(v));
  },
  removeItem(k) {
    memory.delete(k);
  },
  clear() {
    memory.clear();
  },
};

// Stubs
(globalThis as unknown as { window: unknown; localStorage: unknown }).window = {
  localStorage: mockStorage,
  crypto: { randomUUID: () => uuid_stub() },
};
(globalThis as unknown as { localStorage: unknown }).localStorage = mockStorage;

let counter = 0;
function uuid_stub() {
  counter += 1;
  return `uuid-${counter}`;
}

// ---------- mini runner ----------

interface Test {
  name: string;
  fn: () => void | Promise<void>;
}

const tests: Test[] = [];
function test(name: string, fn: Test['fn']) {
  tests.push({ name, fn });
}
function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error('assertion failed: ' + m);
}
function assertEq<T>(actual: T, expected: T, m: string) {
  if (actual !== expected) {
    throw new Error(`assertion failed: ${m} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
}

// ---------- tab-helpers tests ----------

test('uuid returns string', () => {
  const u = uuid();
  assert(typeof u === 'string' && u.length > 0, 'uuid non-empty string');
});

test('deriveTitle returns fallback for empty', () => {
  assertEq(deriveTitle(''), 'Untitled', 'fallback');
  assertEq(deriveTitle('   \n\n   '), 'Untitled', 'whitespace fallback');
});

test('deriveTitle parses JS comment', () => {
  assertEq(deriveTitle('// My snippet'), 'My snippet', 'comment');
  assertEq(deriveTitle('  //  hello  '), 'hello', 'comment trim');
});

test('deriveTitle parses block comment', () => {
  assertEq(deriveTitle('/* block title */'), 'block title', 'block');
});

test('deriveTitle extracts identifier', () => {
  assertEq(deriveTitle('const foo = 1;'), 'foo', 'const');
  assertEq(deriveTitle('function bar(){}'), 'bar', 'function');
  assertEq(deriveTitle('class Baz {}'), 'Baz', 'class');
});

test('deriveTitle truncates long title to 37 chars + ellipsis', () => {
  const long = '// ' + 'x'.repeat(60);
  const t = deriveTitle(long);
  assert(t.endsWith('…'), 'ellipsis');
  assert(t.length <= 40, 'cap');
});

test('persistedFromState drops runtime fields', () => {
  const state = {
    tabs: [
      {
        id: 'a',
        title: 't',
        code: 'c',
        language: 'javascript' as const,
        result: { console: [], return_value: null, error: null, duration_ms: 0 },
        running: true,
        dirty: true,
      },
    ],
    activeId: 'a',
  };
  const out = persistedFromState(state);
  assertEq(out.tabs.length, 1, 'one tab');
  const t = out.tabs[0]!;
  assertEq(t.id, 'a', 'id');
  assertEq(t.title, 't', 'title');
  assertEq(t.code, 'c', 'code');
  assertEq(t.language, 'javascript', 'lang');
  assert(!('result' in t), 'no result');
  assert(!('running' in t), 'no running');
  assert(!('dirty' in t), 'no dirty');
});

test('isValidPersisted accepts clean shapes', () => {
  assert(isValidPersisted({ tabs: [{ id: 'a', code: 'x', language: 'javascript' }], activeId: 'a' }), 'simple');
  assert(isValidPersisted({ tabs: [], activeId: 'a' }), 'empty tabs');
});

test('isValidPersisted rejects malformed', () => {
  assert(!isValidPersisted(null), 'null');
  assert(!isValidPersisted({}), 'empty');
  assert(!isValidPersisted({ tabs: 'no', activeId: 'a' }), 'tabs not array');
  assert(!isValidPersisted({ tabs: [{ id: 1 }], activeId: 'a' }), 'bad id type');
  assert(!isValidPersisted({ tabs: [{ id: 'a', code: 'x', language: 'python' }], activeId: 'a' }), 'bad lang');
  assert(!isValidPersisted({ tabs: [{ id: 'a', code: 1, language: 'js' }], activeId: 'a' }), 'bad code');
});

test('cloneTabData copies fields', () => {
  const t = { id: 'a', title: 't', code: 'c', language: 'javascript' as const, result: null, running: false, dirty: false };
  const out = cloneTabData(t);
  assertEq(out.id, 'a', 'id');
  assertEq(out.code, 'c', 'code');
});

// ---------- createTabs tests ----------

function fresh() {
  memory.clear();
  counter = 0;
  return createTabs();
}

function setLegacy(code: string) {
  memory.set('oxi.code', code);
}

function setStored(data: { tabs: Array<{ id: string; title: string; code: string; language: string }>; activeId: string }) {
  memory.set('oxi.tabs', JSON.stringify(data));
}

test('hydrate from legacy oxi.code creates one tab', () => {
  setLegacy('const x = 1;');
  const t = createTabs();
  const state = t.getState();
  assertEq(state.tabs.length, 1, 'one tab');
  assertEq(state.tabs[0]!.code, 'const x = 1;', 'code from legacy');
  assertEq(state.activeId, state.tabs[0]!.id, 'active');
  assertEq(memory.has('oxi.code'), false, 'legacy cleared');
});

test('hydrate from stored oxi.tabs', () => {
  setStored({
    tabs: [
      { id: 't1', title: 'first', code: 'a', language: 'javascript' },
      { id: 't2', title: 'second', code: 'b', language: 'typescript' },
    ],
    activeId: 't2',
  });
  const t = createTabs();
  const state = t.getState();
  assertEq(state.tabs.length, 2, 'two tabs');
  assertEq(state.activeId, 't2', 'active t2');
  assertEq(state.tabs[1]!.code, 'b', 'code preserved');
});

test('hydrate without anything creates default tab', () => {
  const t = fresh();
  const state = t.getState();
  assertEq(state.tabs.length, 1, 'one tab');
  assert(state.tabs[0]!.code.includes('Welcome to oxi_js'), 'default code');
});

test('subscribe fires on addTab with the new tab id', () => {
  const t = fresh();
  let received: string[] = [];
  t.subscribe((s) => received.push(s.activeId));
  received = [];
  const id = t.addTab('// hi', 'typescript');
  assertEq(received[received.length - 1], id, 'active is new');
  assertEq(t.getState().tabs.length, 2, 'two tabs');
});

test('addTab schedules persist and writes oxi.tabs', async () => {
  const t = fresh();
  t.addTab('// tab2');
  await new Promise((r) => setTimeout(r, 400));
  const raw = memory.get('oxi.tabs');
  assert(raw, 'persisted');
  const parsed = JSON.parse(raw!);
  assertEq(parsed.tabs.length, 2, 'two tabs in storage');
});

test('closeTab on non-active does not change active', () => {
  const t = fresh();
  const first = t.addTab('// a');
  t.addTab('// b');
  const activeBefore = t.getState().activeId;
  t.closeTab(first);
  assertEq(t.getState().activeId, activeBefore, 'active preserved');
  assertEq(t.getState().tabs.length, 2, 'two remain');
});

test('closeTab on active selects previous', () => {
  const t = fresh();
  const first = t.addTab('// a');
  const last = t.addTab('// b');
  t.selectTab(last);
  t.closeTab(last);
  const state = t.getState();
  assertEq(state.tabs.length, 2, 'two remain');
  assertEq(state.activeId, first, 'active moved to first');
});

test('closeTab on the only tab creates a fresh empty one', () => {
  const t = fresh();
  const onlyId = t.getState().activeId;
  t.closeTab(onlyId);
  const state = t.getState();
  assertEq(state.tabs.length, 1, 'one tab remains');
  assertEq(state.tabs[0]!.code, '', 'fresh empty code');
  assert(state.tabs[0]!.id !== onlyId, 'different id');
});

test('selectTab activates and notifies', () => {
  const t = fresh();
  const a = t.addTab('a');
  // a is now active. Add b and switch to it.
  const b = t.addTab('b');
  assertEq(t.getState().activeId, b, 'b initially active');
  let notified = 0;
  t.subscribe(() => notified++);
  notified = 0;
  t.selectTab(a);
  assert(notified > 0, 'notified');
  assertEq(t.getState().activeId, a, 'active is a');
});

test('selectTab ignores unknown id', () => {
  const t = fresh();
  t.selectTab('nope');
  assert(t.getState().activeId.length > 0, 'has active');
});

test('selectTab with current active does nothing', () => {
  const t = fresh();
  const active = t.getState().activeId;
  let count = 0;
  t.subscribe(() => count++);
  // First call from subscribe itself:
  count = 0;
  t.selectTab(active);
  assertEq(count, 0, 'no notification');
});

test('updateTabCode updates code and title and dirty', () => {
  const t = fresh();
  const id = t.getState().activeId;
  t.updateTabCode(id, '// New title\nfoo');
  const tab = t.getTab(id)!;
  assertEq(tab.code, '// New title\nfoo', 'code');
  assertEq(tab.title, 'New title', 'title');
  assertEq(tab.dirty, true, 'dirty');
});

test('setTabResult sets result and clears running/dirty', () => {
  const t = fresh();
  const id = t.getState().activeId;
  t.updateTabCode(id, 'x');
  t.setTabRunning(id, true);
  t.setTabResult(id, {
    console: [{ level: 'log', parts: ['x'] }],
    return_value: 1,
    error: null,
    duration_ms: 5,
  });
  const tab = t.getTab(id)!;
  assertEq(tab.running, false, 'not running');
  assertEq(tab.dirty, false, 'not dirty');
  assert(tab.result !== null, 'has result');
  assertEq(tab.result!.duration_ms, 5, 'duration');
});

test('setTabRunning toggles running flag', () => {
  const t = fresh();
  const id = t.getState().activeId;
  t.setTabRunning(id, true);
  assertEq(t.getTab(id)!.running, true, 'running true');
  t.setTabRunning(id, false);
  assertEq(t.getTab(id)!.running, false, 'running false');
});

test('getActive returns the active tab', () => {
  const t = fresh();
  const id = t.getState().activeId;
  const a = t.getActive();
  assertEq(a!.id, id, 'matches');
});

test('getTab returns null for unknown id', () => {
  const t = fresh();
  assertEq(t.getTab('nope'), null, 'null');
});

test('persistedFromState in store drops runtime fields', async () => {
  const t = fresh();
  t.addTab('// a');
  const id = t.getState().activeId;
  t.setTabRunning(id, true);
  await new Promise((r) => setTimeout(r, 400));
  const raw = memory.get('oxi.tabs')!;
  const parsed = JSON.parse(raw);
  for (const tab of parsed.tabs) {
    assert(!('running' in tab), `no running in ${tab.id}`);
    assert(!('dirty' in tab), `no dirty in ${tab.id}`);
    assert(!('result' in tab), `no result in ${tab.id}`);
  }
});

test('flushPersist writes immediately', () => {
  const t = fresh();
  t.addTab('// flush');
  t.flushPersist();
  assert(memory.has('oxi.tabs'), 'persisted now');
});

test('max bytes silently skipped', async () => {
  const t = fresh();
  // produce huge code (under IPC cap but over oxi.tabs cap=5MB)
  const big = 'a'.repeat(6_000_000);
  t.updateTabCode(t.getState().activeId, big);
  await new Promise((r) => setTimeout(r, 400));
  assert(!memory.has('oxi.tabs'), 'not persisted');
});

// ---------- run ----------

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