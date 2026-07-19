import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import * as v from 'valibot';
import type { ExecutionResult, SaveCodeResult } from '../shared/types.ts';
import {
  ExecutePayloadSchema,
  SaveCodePayloadSchema,
} from '../shared/ipc-schemas.ts';
import { executeCode } from './sandbox.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ELECTRON_RENDERER_URL = process.env.ELECTRON_RENDERER_URL;
const RENDERER_DIST = join(__dirname, '../renderer');

let win: BrowserWindow | null = null;
const PRELOAD = join(__dirname, '../preload/index.mjs');

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 800,
    minHeight: 500,
    title: 'oxi_js',
    backgroundColor: '#00000000',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (ELECTRON_RENDERER_URL) {
    win.loadURL(ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(RENDERER_DIST, 'index.html'));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ------------------------------------------------------------------
// IPC handlers
// ------------------------------------------------------------------

function formatIssues(issues: readonly { message?: string }[]): string {
  const msgs = issues.map((i) => i.message).filter(Boolean);
  return msgs.length > 0 ? msgs.join('; ') : 'Invalid payload';
}

ipcMain.handle('execute_code', async (_evt, payload: unknown): Promise<ExecutionResult> => {
  const parsed = v.safeParse(ExecutePayloadSchema, payload);
  if (!parsed.success) {
    return {
      console: [],
      return_value: null,
      error: {
        message: formatIssues(parsed.issues),
        line: null,
        column: null,
        stack: null,
      },
      duration_ms: 0,
    };
  }
  return executeCode(parsed.output.code, parsed.output.language);
});

ipcMain.handle('app_version', () => app.getVersion());

ipcMain.handle(
  'save_code',
  async (_evt, payload: unknown): Promise<SaveCodeResult> => {
    const parsed = v.safeParse(SaveCodePayloadSchema, payload);
    if (!parsed.success) {
      return { ok: false, canceled: false, error: formatIssues(parsed.issues) };
    }
    const { code, defaultName } = parsed.output;
    const options = {
      title: 'Export snippet',
      defaultPath: defaultName ?? 'snippet.js',
      filters: [
        { name: 'JavaScript', extensions: ['js'] },
        { name: 'TypeScript', extensions: ['ts'] },
        { name: 'Text', extensions: ['txt'] },
      ],
    };
    const { canceled, filePath } = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options);
    if (canceled || !filePath) return { ok: false, canceled: true };
    await writeFile(filePath, code, 'utf8');
    return { ok: true, filePath };
  }
);