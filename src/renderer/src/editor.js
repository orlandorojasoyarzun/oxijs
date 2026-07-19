import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new jsonWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: false,
});
monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: false,
});

monaco.editor.defineTheme('oxi-kanagawa', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '727169', fontStyle: 'italic' },
    { token: 'keyword', foreground: '957fb8' },
    { token: 'string', foreground: '87a987' },
    { token: 'number', foreground: 'b6927b' },
    { token: 'type', foreground: '7fb4ca' },
    { token: 'function', foreground: '7fb4ca' },
    { token: 'variable', foreground: 'dcd7ba' },
    { token: 'operator', foreground: 'c4a36e' },
  ],
  colors: {
    'editor.background': '#00000000',
    'editorGutter.background': '#1f1f28',
    'editor.foreground': '#dcd7ba',
    'editorLineNumber.foreground': '#9a9485',
    'editorLineNumber.activeForeground': '#dcd7ba',
    'editor.lineHighlightBackground': '#22232c',
    'editorCursor.foreground': '#c4a36e',
    'editor.selectionBackground': '#2d4f89',
    'editor.findMatchBackground': '#3c5078',
    'editorIndentGuide.background1': '#2f3549',
    'editorBracketMatch.background': '#2f3549',
  },
});

let editor = null;

export function createEditor(containerId, value, language) {
  const container = document.getElementById(containerId);
  editor = monaco.editor.create(container, {
    value,
    language,
    theme: 'oxi-kanagawa',
    automaticLayout: true,
    fontSize: 14,
    fontFamily: "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace",
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    tabSize: 2,
    renderLineHighlight: 'all',
    bracketPairColorization: { enabled: true },
    padding: { top: 12, bottom: 12 },
  });
  return editor;
}

export function createModel(value, language) {
  return monaco.editor.createModel(value, language);
}

export function disposeModel(model) {
  if (model) model.dispose();
}

export function setActiveModel(model) {
  if (editor && model) editor.setModel(model);
}

export function getEditor() {
  return editor;
}

export function setWordWrap(on) {
  if (editor) editor.updateOptions({ wordWrap: on ? 'on' : 'off' });
}

export function setLanguage(model, language) {
  if (model) monaco.editor.setModelLanguage(model, language);
}

export function revealLine(model, line, column) {
  if (!editor || !model || !line) return;
  setActiveModel(model);
  editor.revealLineInCenter(line);
  editor.setPosition({ lineNumber: line, column: column || 1 });
  editor.focus();
}

export function onDidChangeModelContent(handler) {
  if (editor) return editor.onDidChangeModelContent(handler);
  return { dispose() {} };
}

export function onKeyDown(handler) {
  if (editor) return editor.onKeyDown(handler);
  return { dispose() {} };
}