# oxi_js_electron

A RunJS-style JavaScript / TypeScript playground built as a native desktop app
with **Electron + Node.js**.

- **Main process:** Node.js with the built-in `vm` module as a sandbox.
- **Renderer process:** Vite + vanilla JS + Monaco Editor.
- **TypeScript:** stripped by [`sucrase`](https://github.com/alangpierce/sucrase)
  before execution.

```
┌────────────────────────────┬────────────────────────────┐
│  Monaco editor (JS / TS)   │  Output panel              │
│                            │   • log / info / warn / …  │
│                            │   • errors w/ line numbers │
│                            │   • return value           │
└────────────────────────────┴────────────────────────────┘
```

## Features

- Editor with syntax highlighting (Monaco)
- JavaScript and TypeScript modes
- Captured `console.log / info / warn / error / debug` output
- Runtime errors with line and column, click to jump
- **Real `async` / `await`** via Promise awaiting — `setTimeout` works with
  actual delay (Node timer, not a stub)
- Sandboxed execution — no `require`, `process`, `fs`, `global`
- Cmd/Ctrl + Enter shortcut
- Resizable panes, dark theme

## Limitations

This is the **0.1 MVP**:

- No autocompletion / IntelliSense (Monaco TS worker disabled).
- No DOM, no `fetch`, no Node APIs (`require`, `process`, `fs` blocked).
- No persistence of code between sessions.
- No multi-tab.
- 5s sync timeout + 10s async timeout per execution.

## Requirements

- Node.js 18+
- [pnpm](https://pnpm.io/) 11+
- macOS / Linux / Windows

## Develop

```bash
pnpm install
pnpm dev
```

This starts Vite + Electron with HMR for the renderer. The main and preload
processes are rebuilt on save.

## Build

```bash
pnpm build          # type-check + bundle to out/
pnpm start          # preview the built app
pnpm dist:mac       # produce .dmg in dist/
pnpm dist:win       # produce .nsis installer in dist/
pnpm dist:linux     # produce .AppImage / .deb in dist/
```

`electron-builder` is configured via `electron-builder.yml`.

## Tests

```bash
pnpm test
```

Runs the sandbox suite (via `tsx`): sync/async execution, console levels, TS
stripping, sandbox isolation, error reporting, timeout handling, sanitizer
limits, and line/column extraction.

## Type-check

```bash
pnpm typecheck
```

Checks both the Node-side (main + preload) and web-side (renderer) projects.

## Project layout

```
oxi_js_electron/
├── electron.vite.config.ts        Build config (main / preload / renderer)
├── electron-builder.yml           Packaging config
├── tsconfig.json / .node / .web   TypeScript projects
├── package.json
├── pnpm-workspace.yaml            allowBuilds: esbuild, electron
├── build/                         Icons
├── scripts/
│   └── test-sandbox.ts            Sandbox tests (tsx)
├── src/
│   ├── main/index.ts              Main process (IPC + window)
│   ├── preload/index.ts           contextBridge
│   ├── renderer/
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.js            UI + IPC
│   │       ├── editor.js          Monaco
│   │       ├── output.js          Console panel
│   │       └── styles.css
│   └── shared/
│       ├── sandbox.ts             vm sandbox + execution
│       ├── ipc-schemas.ts         valibot IPC payload schemas
│       └── types.ts               Shared TS types
└── out/                           Build output (gitignored)
```

## How it works

1. The frontend (Monaco) sends `{ code, language }` to the main process via
   `window.oxi.executeCode()` → `ipcRenderer.invoke('execute_code')`.
2. If `language === 'typescript'`, the main process strips types with
   `sucrase.transform(code, { transforms: ['typescript'] })`.
3. A fresh `vm.Context` is created with a strict sandbox (only `console.*`,
   `setTimeout/Interval`, `Promise`, `setImmediate`, `queueMicrotask`, common
   JS builtins — no Node globals).
4. The code is compiled as `new vm.Script(code, { filename: 'snippet.js' })`
   so errors reference `snippet.js:LINE:COL`.
5. `script.runInContext()` runs synchronously. If the result is thenable (async
   IIFE), it's awaited with a 10s timeout.
6. `Error.stack` is parsed for line/column. Captured console messages and
   the return value (or error) are serialized and returned.

## License

MIT