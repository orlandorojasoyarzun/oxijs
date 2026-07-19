export function uuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 't-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function deriveTitle(code, fallback = 'Untitled') {
  if (!code) return fallback;
  const lines = code.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('//')) {
      const t = line.replace(/^\/\/\s*/, '').trim();
      if (t) return t.length > 40 ? t.slice(0, 37) + '…' : t;
    } else if (line.startsWith('/*')) {
      const t = line.replace(/^\/\*+\s*/, '').replace(/\s*\*+\/$/, '').trim();
      if (t) return t.length > 40 ? t.slice(0, 37) + '…' : t;
    } else {
      const m = line.match(/^(?:const|let|var|function|class|async\s+function)\s+([A-Za-z_$][\w$]*)/);
      if (m) return m[1];
      const trimmed = line.length > 40 ? line.slice(0, 37) + '…' : line;
      return trimmed || fallback;
    }
  }
  return fallback;
}

export function cloneTabData(tab) {
  return {
    id: tab.id,
    title: tab.title,
    code: tab.code,
    language: tab.language,
  };
}

export function persistedFromState(state) {
  return {
    tabs: state.tabs.map(cloneTabData),
    activeId: state.activeId,
  };
}

export function isValidPersisted(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (!Array.isArray(obj.tabs)) return false;
  if (typeof obj.activeId !== 'string') return false;
  for (const t of obj.tabs) {
    if (!t || typeof t.id !== 'string' || typeof t.code !== 'string') return false;
    if (t.language !== 'javascript' && t.language !== 'typescript') return false;
  }
  return true;
}