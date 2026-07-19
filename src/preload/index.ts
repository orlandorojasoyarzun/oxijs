import { contextBridge, ipcRenderer } from 'electron';
import type { Language, OxiApi } from '../shared/types.ts';

const api: OxiApi = {
  executeCode: (code: string, language: Language) =>
    ipcRenderer.invoke('execute_code', { code, language }),
  getVersion: () => ipcRenderer.invoke('app_version'),
  platform: process.platform,
  saveCode: (code: string, defaultName?: string) =>
    ipcRenderer.invoke('save_code', { code, defaultName }),
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('oxi', api);
  } catch (error) {
    console.error(error);
  }
} else {
  (globalThis as unknown as { oxi: OxiApi }).oxi = api;
}