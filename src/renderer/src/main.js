import {
  createEditor,
  createModel,
  disposeModel,
  setActiveModel,
  getEditor,
  setWordWrap,
  setLanguage,
  revealLine,
  onDidChangeModelContent,
  onKeyDown,
} from './editor.js';
import { renderResult, clearOutput, setDuration } from './output.js';
import { mountTabBar } from './tab-bar.js';
import { createTabs } from './tabs.js';

const STORAGE_WORD_WRAP = 'oxi.wordWrap';

const runBtn = document.getElementById('run-btn');
const clearBtn = document.getElementById('clear-btn');
const languageSelect = document.getElementById('language');
const durationEl = document.getElementById('duration');
const tabBarEl = document.getElementById('tab-bar');
const outputEl = document.getElementById('output');

let wordWrapOn = false;

function readWordWrap() {
  try {
    return localStorage.getItem(STORAGE_WORD_WRAP) === '1';
  } catch {
    return false;
  }
}

function writeWordWrap(v) {
  try {
    localStorage.setItem(STORAGE_WORD_WRAP, v ? '1' : '0');
  } catch {}
}

function gotoLine(line, column) {
  const state = store.getState();
  const active = store.getActive();
  if (!active) return;
  const model = models.get(active.id);
  revealLine(model, line, column);
}

function renderActiveOutput() {
  const active = store.getActive();
  if (!active) {
    clearOutput(outputEl);
    setDuration(durationEl, 0);
    return;
  }
  renderResult(outputEl, active.result, gotoLine);
  setDuration(durationEl, active.result?.duration_ms ?? 0);
}

function syncToolbar() {
  const active = store.getActive();
  languageSelect.value = active?.language ?? 'javascript';
  runBtn.disabled = !!active?.running;
  runBtn.classList.toggle('running', !!active?.running);
  durationEl.textContent = active?.running ? 'running…' : '';
}

const models = new Map();

function modelForTab(tab) {
  let m = models.get(tab.id);
  if (!m) {
    m = createModel(tab.code, tab.language);
    models.set(tab.id, m);
  } else {
    setLanguage(m, tab.language);
  }
  return m;
}

function disposeTabModel(tabId) {
  const m = models.get(tabId);
  if (m) {
    disposeModel(m);
    models.delete(tabId);
  }
}

const store = createTabs();

function applyActive() {
  const active = store.getActive();
  if (!active) return;
  const model = modelForTab(active);
  setActiveModel(model);
  syncToolbar();
  renderActiveOutput();
}

mountTabBar(tabBarEl, store, {
  onAdd: () => store.addTab(),
  onClose: (id) => {
    const closingActive = id === store.getState().activeId;
    disposeTabModel(id);
    const newActiveId = store.closeTab(id);
    if (closingActive) applyActive();
  },
  onSelect: (id) => {
    store.selectTab(id);
  },
});

createEditor('editor', '', 'javascript');

wordWrapOn = readWordWrap();
setWordWrap(wordWrapOn);

const initial = store.getState();
for (const tab of initial.tabs) {
  modelForTab(tab);
}
applyActive();

onDidChangeModelContent(() => {
  const active = store.getActive();
  if (!active) return;
  const m = models.get(active.id);
  if (!m) return;
  const value = m.getValue();
  if (value !== active.code) {
    store.updateTabCode(active.id, value);
  }
});

onKeyDown((e) => {
  if (e.altKey && e.code === 'KeyZ') {
    e.preventDefault();
    wordWrapOn = !wordWrapOn;
    setWordWrap(wordWrapOn);
    writeWordWrap(wordWrapOn);
  }
});

store.subscribe(() => {
  const { tabs } = store.getState();
  for (const tab of tabs) {
    if (!models.has(tab.id)) modelForTab(tab);
  }
  applyActive();
});

languageSelect.addEventListener('change', () => {
  const active = store.getActive();
  if (!active) return;
  const m = models.get(active.id);
  if (m) setLanguage(m, languageSelect.value);
  store.setTabLanguage(active.id, languageSelect.value);
});

async function runActive() {
  const active = store.getActive();
  if (!active || active.running) return;
  const m = models.get(active.id);
  if (!m) return;
  const code = m.getValue();
  const language = active.language;

  store.setTabRunning(active.id, true);
  syncToolbar();
  setDuration(durationEl, 0);
  durationEl.textContent = 'running…';

  try {
    const result = await window.oxi.executeCode(code, language);
    store.setTabResult(active.id, result);
  } catch (err) {
    store.setTabResult(active.id, {
      console: [],
      return_value: null,
      error: {
        message: String(err),
        line: null,
        column: null,
        stack: null,
      },
      duration_ms: 0,
    });
  } finally {
    const stillActive = store.getState().activeId === active.id;
    if (stillActive) {
      syncToolbar();
      renderActiveOutput();
    }
  }
}

runBtn.addEventListener('click', runActive);
clearBtn.addEventListener('click', () => {
  const active = store.getActive();
  if (!active) return;
  store.setTabResult(active.id, null);
  if (store.getState().activeId === active.id) {
    clearOutput(outputEl);
    setDuration(durationEl, 0);
  }
});

const exportBtn = document.getElementById('export-btn');
if (exportBtn) {
  exportBtn.addEventListener('click', async () => {
    const active = store.getActive();
    if (!active) return;
    const lang = active.language === 'typescript' ? 'ts' : 'js';
    try {
      const result = await window.oxi.saveCode(active.code, `${active.title || 'snippet'}.${lang}`);
      if (result?.ok && result.filePath) {
        store.setTabResult(active.id, {
          console: [{ level: 'log', parts: [`Exported to ${result.filePath}`] }],
          return_value: null,
          error: null,
          duration_ms: 0,
        });
      } else if (result?.error) {
        store.setTabResult(active.id, {
          console: [],
          return_value: null,
          error: { message: result.error, line: null, column: null, stack: null },
          duration_ms: 0,
        });
      }
      if (store.getState().activeId === active.id) renderActiveOutput();
    } catch (e) {
      store.setTabResult(active.id, {
        console: [],
        return_value: null,
        error: { message: `Export failed: ${e}`, line: null, column: null, stack: null },
        duration_ms: 0,
      });
      if (store.getState().activeId === active.id) renderActiveOutput();
    }
  });
}

document.addEventListener('keydown', (e) => {
  const meta = e.metaKey || e.ctrlKey;
  if (!meta) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    runActive();
    return;
  }
  if (e.key.toLowerCase() === 't') {
    e.preventDefault();
    store.addTab();
    applyActive();
    return;
  }
  if (e.key.toLowerCase() === 'w') {
    e.preventDefault();
    const active = store.getActive();
    if (!active) return;
    if (store.getState().tabs.length === 1) {
      store.flushPersist();
      return;
    }
    disposeTabModel(active.id);
    store.closeTab(active.id);
    applyActive();
    return;
  }
  if (e.key >= '1' && e.key <= '9') {
    const idx = parseInt(e.key, 10) - 1;
    const { tabs } = store.getState();
    if (idx < tabs.length) {
      e.preventDefault();
      store.selectTab(tabs[idx].id);
      applyActive();
    }
  }
});

function initResizer() {
  const resizer = document.getElementById('resizer');
  const editorPane = document.getElementById('editor-pane');
  const outputPane = document.getElementById('output-pane');
  const workspace = document.querySelector('.workspace');
  let dragging = false;

  resizer.addEventListener('mousedown', (e) => {
    dragging = true;
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = workspace.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const min = 200;
    const max = rect.width - 200;
    const left = Math.max(min, Math.min(max, x));
    editorPane.style.flex = `0 0 ${left}px`;
    outputPane.style.flex = '1 1 auto';
  });

  window.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false;
      document.body.style.cursor = '';
    }
  });
}

initResizer();

window.addEventListener('beforeunload', () => {
  store.flushPersist();
});