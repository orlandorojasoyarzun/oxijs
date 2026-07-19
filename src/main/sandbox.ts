import vm from 'node:vm';
import { transform as sucraseTransform } from 'sucrase';
import type {
  ConsoleLevel,
  ConsoleMessage,
  ExecutionResult,
  RuntimeError,
} from '../shared/types.ts';
import type { Language } from '../shared/ipc-schemas.ts';

export const SYNC_TIMEOUT_MS = 5_000;
export const ASYNC_TIMEOUT_MS = 10_000;
export const SANITIZE_MAX_DEPTH = 10;
export const SANITIZE_MAX_KEYS = 1_000;
export const SANITIZE_MAX_ARR_LEN = 10_000;

export function isThenable(v: unknown): v is PromiseLike<unknown> {
  return (
    v !== null &&
    typeof v === 'object' &&
    typeof (v as { then?: unknown }).then === 'function'
  );
}

export function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`Execution timed out after ${ms}ms`)),
      ms
    );
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

export function sanitizeForIPC(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0,
  budget = { keys: 0 }
): unknown {
  if (depth > SANITIZE_MAX_DEPTH) return '[Max depth]';
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === 'function') {
    return `[Function: ${(value as Function).name || 'anonymous'}]`;
  }
  if (t === 'symbol') return value.toString();
  if (t === 'bigint') return value.toString();
  if (t !== 'object') return value;
  if (seen.has(value as object)) return '[Circular]';
  seen.add(value as object);

  if (value instanceof Date) return value.toISOString();
  if (value instanceof RegExp) return value.toString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ?? null,
    };
  }
  if (value instanceof Map) {
    const out: Record<string, unknown> = {};
    let i = 0;
    for (const [k, v] of value) {
      if (++budget.keys > SANITIZE_MAX_KEYS) {
        out[String(k)] = '[Truncated]';
        break;
      }
      out[String(k)] = sanitizeForIPC(v, seen, depth + 1, budget);
      i++;
    }
    return out;
  }
  if (value instanceof Set) {
    return Array.from(value)
      .slice(0, SANITIZE_MAX_ARR_LEN)
      .map((v) => {
        if (++budget.keys > SANITIZE_MAX_KEYS) return '[Truncated]';
        return sanitizeForIPC(v, seen, depth + 1, budget);
      });
  }
  if (Array.isArray(value)) {
    const sliced = value.length > SANITIZE_MAX_ARR_LEN ? value.slice(0, SANITIZE_MAX_ARR_LEN) : value;
    return sliced.map((v) => {
      try {
        if (++budget.keys > SANITIZE_MAX_KEYS) return '[Truncated]';
        return sanitizeForIPC(v, seen, depth + 1, budget);
      } catch {
        return '[Unserializable]';
      }
    });
  }
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(value as object)) {
    try {
      if (++budget.keys > SANITIZE_MAX_KEYS) {
        out[k] = '[Truncated]';
        break;
      }
      out[k] = sanitizeForIPC((value as Record<string, unknown>)[k], seen, depth + 1, budget);
    } catch {
      out[k] = '[Unserializable]';
    }
  }
  return out;
}

export function buildSandbox(logs: ConsoleMessage[]): vm.Context {
  const makeLogger =
    (level: ConsoleLevel) =>
    (...args: unknown[]): void => {
      logs.push({ level, parts: args.map((a) => sanitizeForIPC(a)) });
    };

  return {
    console: {
      log: makeLogger('log'),
      info: makeLogger('info'),
      warn: makeLogger('warn'),
      error: makeLogger('error'),
      debug: makeLogger('debug'),
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    setImmediate,
    clearImmediate,
    queueMicrotask,
    Promise,
    Symbol,
    JSON,
    Math,
    Date,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Error,
    TypeError,
    RangeError,
    SyntaxError,
    ReferenceError,
    URIError,
    EvalError,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURI,
    encodeURIComponent,
    decodeURI,
    decodeURIComponent,
    structuredClone,
  } as unknown as vm.Context;
}

export function extractLineColumn(
  stack: string | null
): { line: number | null; column: number | null } {
  if (!stack) return { line: null, column: null };
  // Patterns we may encounter:
  //   "at snippet.js:5:3"
  //   "at Object.<anonymous> (snippet.js:5:3)"
  //   "at script:5:3"
  //   "evalmachine.<anonymous>:1:1"  (synthetic context)
  let m = stack.match(/(?:snippet|script)\.js:(\d+):(\d+)/);
  if (m) return { line: parseInt(m[1], 10), column: parseInt(m[2], 10) };
  m = stack.match(/<anonymous>:(\d+):(\d+)/);
  if (m) return { line: parseInt(m[1], 10), column: parseInt(m[2], 10) };
  const fallback = stack.match(/(?:snippet|script)\.js:(\d+)/);
  if (fallback) return { line: parseInt(fallback[1], 10), column: null };
  return { line: null, column: null };
}

export function errResult(
  e: unknown,
  start: number,
  logs: ConsoleMessage[]
): ExecutionResult {
  const err = e as Error;
  const stack = err.stack ?? null;
  const lineCol = extractLineColumn(stack);
  return {
    console: logs,
    return_value: null,
    error: {
      message: err.message ?? String(e),
      line: lineCol.line,
      column: lineCol.column,
      stack,
    } satisfies RuntimeError,
    duration_ms: Date.now() - start,
  };
}

export type CompileResult =
  | { ok: true; code: string }
  | { ok: false; error: { message: string; line: number | null; column: number | null; stack: string | null } };

export function compileSource(source: string, language: Language): CompileResult {
  if (language !== 'typescript') return { ok: true, code: source };
  try {
    return { ok: true, code: sucraseTransform(source, { transforms: ['typescript'] }).code };
  } catch (e) {
    const err = e as Error & { line?: number; column?: number };
    return {
      ok: false,
      error: {
        message: err.message ?? 'TypeScript transform failed',
        line: err.line ?? null,
        column: err.column ?? null,
        stack: err.stack ?? null,
      },
    };
  }
}

export async function executeCode(
  source: string,
  language: Language
): Promise<ExecutionResult> {
  const start = Date.now();
  const logs: ConsoleMessage[] = [];

  const compiled = compileSource(source, language);
  if (!compiled.ok) {
    return {
      console: [],
      return_value: null,
      error: compiled.error,
      duration_ms: Date.now() - start,
    };
  }
  const code = compiled.code;

  const sandbox = buildSandbox(logs);

  let context: vm.Context;
  try {
    context = vm.createContext(sandbox, {
      name: 'oxi_js',
      codeGeneration: { strings: false, wasm: false },
    });
  } catch (e) {
    return errResult(e, start, logs);
  }

  let script: vm.Script;
  try {
    script = new vm.Script(code, { filename: 'snippet.js' });
  } catch (e) {
    return errResult(e, start, logs);
  }

  try {
    const raw = script.runInContext(context, {
      displayErrors: true,
      timeout: SYNC_TIMEOUT_MS,
    });

    let resolved: unknown = raw;
    if (isThenable(raw)) {
      try {
        resolved = await withTimeout(raw, ASYNC_TIMEOUT_MS);
      } catch (e) {
        return errResult(e, start, logs);
      }
    }

    return {
      console: logs,
      return_value: sanitizeForIPC(resolved === undefined ? null : resolved),
      error: null,
      duration_ms: Date.now() - start,
    };
  } catch (e) {
    return errResult(e, start, logs);
  }
}