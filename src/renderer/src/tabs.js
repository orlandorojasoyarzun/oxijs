import { uuid, deriveTitle, persistedFromState, isValidPersisted } from './tab-helpers.js';

const LEGACY_KEY = 'oxi.code';
const STORAGE_KEY = 'oxi.tabs';
const DEBOUNCE_MS = 300;
const MAX_BYTES = 5_000_000;

const DEFAULT_CODE = `// Welcome to oxi_js (Electron + Node)
// Run with ⌘/Ctrl + Enter

const greeting = "Hello, oxi_js!";
console.log(greeting);

const sum = (a, b) => a + b;
console.log("sum(2, 3) =", sum(2, 3));

// setTimeout is REAL here (Node timer)
await new Promise((r) => setTimeout(r, 100));
console.log("done!");
`;

function safeLocalStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStored() {
  const ls = safeLocalStorage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isValidPersisted(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readLegacy() {
  const ls = safeLocalStorage();
  if (!ls) return null;
  try {
    const code = ls.getItem(LEGACY_KEY);
    if (!code) return null;
    return code;
  } catch {
    return null;
  }
}

function clearLegacy() {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.removeItem(LEGACY_KEY);
  } catch {}
}

function writeNow(state) {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    const data = persistedFromState(state);
    const json = JSON.stringify(data);
    if (json.length > MAX_BYTES) return;
    ls.setItem(STORAGE_KEY, json);
  } catch {}
}

function newTab(code = '', language = 'javascript') {
  return {
    id: uuid(),
    title: deriveTitle(code),
    code,
    language,
    result: null,
    running: false,
    dirty: false,
  };
}

function hydrate() {
  const stored = readStored();
  if (stored && stored.tabs.length > 0) {
    const tabs = stored.tabs.map((t) => ({
      ...t,
      result: null,
      running: false,
      dirty: false,
    }));
    const activeExists = tabs.some((t) => t.id === stored.activeId);
    return { tabs, activeId: activeExists ? stored.activeId : tabs[0].id };
  }
  const legacy = readLegacy();
  if (legacy !== null) {
    const tab = newTab(legacy, 'javascript');
    clearLegacy();
    return { tabs: [tab], activeId: tab.id };
  }
  const tab = newTab(DEFAULT_CODE, 'javascript');
  return { tabs: [tab], activeId: tab.id };
}

export function createTabs() {
  const initial = hydrate();
  let state = initial;
  const listeners = new Set();
  let saveTimer = null;

  function notify() {
    for (const fn of listeners) fn(state);
  }

  function schedulePersist() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      writeNow(state);
    }, DEBOUNCE_MS);
  }

  function updateTab(id, mutator) {
    const idx = state.tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const next = mutator({ ...state.tabs[idx] });
    const tabs = state.tabs.slice();
    tabs[idx] = next;
    state = { ...state, tabs };
    notify();
  }

  return {
    getState() {
      return state;
    },
    subscribe(fn) {
      listeners.add(fn);
      fn(state);
      return () => listeners.delete(fn);
    },
    addTab(code = '', language = 'javascript') {
      const tab = newTab(code, language);
      const tabs = [...state.tabs, tab];
      state = { tabs, activeId: tab.id };
      notify();
      schedulePersist();
      return tab.id;
    },
    closeTab(id) {
      const idx = state.tabs.findIndex((t) => t.id === id);
      if (idx === -1) return;
      if (state.tabs.length === 1) {
        const fresh = newTab('', 'javascript');
        state = { tabs: [fresh], activeId: fresh.id };
        notify();
        schedulePersist();
        return fresh.id;
      }
      const tabs = state.tabs.filter((t) => t.id !== id);
      let activeId = state.activeId;
      if (state.activeId === id) {
        activeId = tabs[Math.max(0, idx - 1)].id;
      }
      state = { tabs, activeId };
      notify();
      schedulePersist();
      return activeId;
    },
    selectTab(id) {
      if (!state.tabs.some((t) => t.id === id)) return;
      if (state.activeId === id) return;
      state = { ...state, activeId: id };
      notify();
    },
    updateTabCode(id, code) {
      updateTab(id, (t) => ({
        ...t,
        code,
        title: deriveTitle(code, t.title),
        dirty: true,
      }));
      schedulePersist();
    },
    setTabLanguage(id, language) {
      updateTab(id, (t) => ({ ...t, language }));
      schedulePersist();
    },
    setTabResult(id, result) {
      updateTab(id, (t) => ({ ...t, result, running: false, dirty: false }));
    },
    setTabRunning(id, running) {
      updateTab(id, (t) => ({ ...t, running }));
    },
    resetTabDirty(id) {
      updateTab(id, (t) => ({ ...t, dirty: false }));
    },
    getActive() {
      return state.tabs.find((t) => t.id === state.activeId) ?? null;
    },
    getTab(id) {
      return state.tabs.find((t) => t.id === id) ?? null;
    },
    flushPersist() {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      writeNow(state);
    },
  };
}