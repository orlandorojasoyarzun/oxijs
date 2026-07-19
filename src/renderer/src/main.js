import { initEditor } from './editor.js';
import { renderResult, clearOutput, setDuration } from './output.js';

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

const runBtn = document.getElementById('run-btn');
const clearBtn = document.getElementById('clear-btn');
const languageSelect = document.getElementById('language');
const durationEl = document.getElementById('duration');

let editor;
let isRunning = false;
let wordWrapOn = false;
const WORD_WRAP_STORAGE_KEY = 'oxi.wordWrap';
const CODE_STORAGE_KEY = 'oxi.code';

function getLanguage() {
  return languageSelect.value;
}

function readStoredWordWrap() {
  try {
    return localStorage.getItem(WORD_WRAP_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeStoredWordWrap(value) {
  try {
    localStorage.setItem(WORD_WRAP_STORAGE_KEY, value ? '1' : '0');
  } catch {}
}

function readStoredCode() {
  try {
    return localStorage.getItem(CODE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredCode(code) {
  try {
    localStorage.setItem(CODE_STORAGE_KEY, code);
  } catch {}
}

async function run() {
  if (isRunning) return;
  isRunning = true;
  runBtn.disabled = true;
  runBtn.classList.add('running');
  durationEl.textContent = 'running…';

  const code = editor.getValue();
  const language = getLanguage();

  try {
    const result = await window.oxi.executeCode(code, language);
    renderResult(result);
    setDuration(result.duration_ms);
  } catch (err) {
    renderResult({
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
    setDuration(0);
  } finally {
    isRunning = false;
    runBtn.disabled = false;
    runBtn.classList.remove('running');
  }
}

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
    if (editor) editor.layout();
  });

  window.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false;
      document.body.style.cursor = '';
    }
  });
}

function main() {
  wordWrapOn = readStoredWordWrap();
  const initialCode = readStoredCode() ?? DEFAULT_CODE;
  editor = initEditor('editor', initialCode, 'javascript');
  editor.updateOptions({ wordWrap: wordWrapOn ? 'on' : 'off' });

  let saveTimer = null;
  editor.onDidChangeModelContent(() => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const value = editor.getValue();
      if (value === DEFAULT_CODE) {
        try {
          localStorage.removeItem(CODE_STORAGE_KEY);
        } catch {}
      } else {
        writeStoredCode(value);
      }
    }, 300);
  });

  editor.onKeyDown((e) => {
    if (e.altKey && e.code === 'KeyZ') {
      e.preventDefault();
      wordWrapOn = !wordWrapOn;
      editor.updateOptions({ wordWrap: wordWrapOn ? 'on' : 'off' });
      writeStoredWordWrap(wordWrapOn);
    }
  });

  languageSelect.addEventListener('change', () => {
    const model = editor.getModel();
    if (model) {
      monaco.editor.setModelLanguage(model, languageSelect.value);
    }
  });

  runBtn.addEventListener('click', run);
  clearBtn.addEventListener('click', () => {
    clearOutput();
    durationEl.textContent = '';
  });

  const exportBtn = document.getElementById('export-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      const lang = languageSelect.value === 'typescript' ? 'ts' : 'js';
      try {
        const result = await window.oxi.saveCode(editor.getValue(), `snippet.${lang}`);
        if (result?.ok && result.filePath) {
          renderResult({
            console: [{ level: 'log', parts: [`Exported to ${result.filePath}`] }],
            return_value: null,
            error: null,
            duration_ms: 0,
          });
        } else if (result?.error) {
          renderResult({
            console: [],
            return_value: null,
            error: { message: result.error, line: null, column: null, stack: null },
            duration_ms: 0,
          });
        }
      } catch (e) {
        renderResult({
          console: [],
          return_value: null,
          error: { message: `Export failed: ${e}`, line: null, column: null, stack: null },
          duration_ms: 0,
        });
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      run();
    }
  });

  initResizer();
}

main();
