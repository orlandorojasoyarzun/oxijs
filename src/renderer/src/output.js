import { gotoLine } from './editor.js';

const outputEl = document.getElementById('output');

function formatValue(v) {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'bigint') return `${v.toString()}n`;
  if (typeof v === 'function') return `[Function: ${v.name || 'anonymous'}]`;
  if (typeof v === 'symbol') return v.toString();
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function appendMessage(msg) {
  const line = document.createElement('div');
  line.className = `output-line level-${msg.level}`;

  const parts = (msg.parts || []).map(formatValue).join(' ');
  const text = document.createElement('span');
  text.className = 'output-text';
  text.textContent = parts;
  line.appendChild(text);

  outputEl.appendChild(line);
  outputEl.scrollTop = outputEl.scrollHeight;
}

function appendReturn(value) {
  if (value === null || value === undefined) return;
  const line = document.createElement('div');
  line.className = 'output-line level-return';
  const prefix = document.createElement('span');
  prefix.className = 'output-prefix';
  prefix.textContent = '⇠';
  const text = document.createElement('span');
  text.className = 'output-text';
  text.textContent = formatValue(value);
  line.appendChild(prefix);
  line.appendChild(text);
  outputEl.appendChild(line);
  outputEl.scrollTop = outputEl.scrollHeight;
}

function appendError(err) {
  const wrap = document.createElement('div');
  wrap.className = 'output-line level-error';

  const title = document.createElement('div');
  title.className = 'error-title';
  title.textContent = err.message || 'Error';
  wrap.appendChild(title);

  if (err.line) {
    const meta = document.createElement('div');
    meta.className = 'error-meta';
    const col = err.column ? `:${err.column}` : '';
    meta.textContent = `at line ${err.line}${col}`;
    meta.style.cursor = 'pointer';
    meta.addEventListener('click', () => gotoLine(err.line, err.column));
    wrap.appendChild(meta);
  }

  if (err.stack) {
    const stack = document.createElement('pre');
    stack.className = 'error-stack';
    stack.textContent = err.stack;
    wrap.appendChild(stack);
  }

  outputEl.appendChild(wrap);
  outputEl.scrollTop = outputEl.scrollHeight;
}

export function renderResult(result) {
  clearOutput();
  for (const msg of result.console || []) {
    appendMessage(msg);
  }
  if (result.return_value !== null && result.return_value !== undefined) {
    appendReturn(result.return_value);
  }
  if (result.error) {
    appendError(result.error);
  }
}

export function clearOutput() {
  outputEl.innerHTML = '';
}

export function setDuration(ms) {
  const el = document.getElementById('duration');
  if (!ms) {
    el.textContent = '';
    return;
  }
  if (ms < 1) {
    el.textContent = '<1 ms';
  } else if (ms < 1000) {
    el.textContent = `${ms.toFixed(1)} ms`;
  } else {
    el.textContent = `${(ms / 1000).toFixed(2)} s`;
  }
}