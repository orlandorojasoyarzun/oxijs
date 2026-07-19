import type { Language } from './ipc-schemas.ts';

export type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface ConsoleMessage {
  level: ConsoleLevel;
  parts: unknown[];
}

export interface RuntimeError {
  message: string;
  line: number | null;
  column: number | null;
  stack: string | null;
}

export interface ExecutionResult {
  console: ConsoleMessage[];
  return_value: unknown;
  error: RuntimeError | null;
  duration_ms: number;
}

export interface ExecutePayload {
  code: string;
  language: Language;
}

export interface SaveCodeResult {
  ok: boolean;
  canceled?: boolean;
  filePath?: string;
  error?: string;
}

export interface OxiApi {
  executeCode: (code: string, language: Language) => Promise<ExecutionResult>;
  getVersion: () => Promise<string>;
  platform: string;
  saveCode: (code: string, defaultName?: string) => Promise<SaveCodeResult>;
}

export interface Tab {
  id: string;
  title: string;
  code: string;
  language: Language;
  result: ExecutionResult | null;
  running: boolean;
  dirty: boolean;
}

export interface TabsState {
  tabs: Tab[];
  activeId: string;
}

export interface PersistedTabs {
  tabs: Array<Pick<Tab, 'id' | 'title' | 'code' | 'language'>>;
  activeId: string;
}

declare global {
  interface Window {
    oxi: OxiApi;
  }
}

export type { Language };