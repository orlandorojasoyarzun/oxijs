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
- Multi-tab interface (browser-style tabs above the editor)
- Per-tab language (JavaScript / TypeScript)
- Concurrent execution across tabs (each runs in its own `vm.Context`)
- Per-tab output: each tab keeps its own last result
- Captured `console.log / info / warn / error / debug` output
- Runtime errors with line and column, click to jump
- **Real `async` / `await`** via Promise awaiting — `setTimeout` works with
  actual delay (Node timer, not a stub)
- Sandboxed execution — no `require`, `process`, `fs`, `global`, `fetch`
- Cmd/Ctrl + Enter shortcut
- Resizable panes, dark theme
- Tabs persist between sessions (`oxi.tabs` in localStorage)

### Tab shortcuts

| Shortcut          | Action                       |
|-------------------|------------------------------|
| ⌘/Ctrl + Enter   | Run active tab               |
| ⌘/Ctrl + T       | New tab                      |
| ⌘/Ctrl + W       | Close active tab             |
| ⌘/Ctrl + 1‑9     | Select tab by index          |
| Alt + Z           | Toggle word wrap             |
| Middle-click tab  | Close tab                    |

## Limitations

This is the **0.2 MVP**:

- No autocompletion / IntelliSense (Monaco TS worker disabled).
- No DOM, no `fetch`, no Node APIs (`require`, `process`, `fs` blocked).
- Tabs persist code and language, but **not** the output history
  (only the last run per tab survives between sessions).
- No drag-to-reorder, no rename, no split panes.
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

You can also run individual suites:

```bash
pnpm test:sandbox   # sandbox tests only (21)
pnpm test:tabs      # multi-tab store tests only (29)
```

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
│   ├── test-sandbox.ts            Sandbox tests (tsx)
│   └── test-tabs.ts               Multi-tab store tests (tsx)
├── src/
│   ├── main/
│   │   ├── index.ts               Main process (window/IPC)
│   │   └── sandbox.ts             vm sandbox + execution
│   ├── preload/index.ts           contextBridge
│   ├── renderer/
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.js            UI + tab orchestration
│   │       ├── editor.js          Monaco (multi-model)
│   │       ├── output.js          Console panel (per-tab)
│   │       ├── tabs.js            Tab store (state + persist)
│   │       ├── tab-bar.js         Tab bar UI
│   │       ├── tab-helpers.js     uuid + title derivation
│   │       └── styles.css
│   └── shared/
│       ├── sandbox.ts             vm sandbox + execution (shared with test)
│       ├── ipc-schemas.ts         valibot IPC payload schemas
│       └── types.ts               Shared TS types (Tab, TabsState, ...)
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