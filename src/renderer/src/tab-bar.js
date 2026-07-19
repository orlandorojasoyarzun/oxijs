export function mountTabBar(container, store, handlers) {
  container.innerHTML = '';
  const list = document.createElement('div');
  list.className = 'tab-list';
  container.appendChild(list);

  const addBtn = document.createElement('button');
  addBtn.className = 'add-tab-btn';
  addBtn.type = 'button';
  addBtn.title = 'New tab (⌘/Ctrl+T)';
  addBtn.setAttribute('aria-label', 'New tab');
  addBtn.textContent = '+';
  addBtn.addEventListener('click', () => handlers.onAdd?.());
  container.appendChild(addBtn);

  function render(state) {
    list.innerHTML = '';
    state.tabs.forEach((tab, idx) => {
      const el = document.createElement('div');
      el.className = 'tab' + (tab.id === state.activeId ? ' active' : '');
      el.setAttribute('role', 'tab');
      el.setAttribute('aria-selected', tab.id === state.activeId ? 'true' : 'false');
      el.dataset.id = tab.id;

      const title = document.createElement('span');
      title.className = 'tab-title';
      title.textContent = tab.title || 'Untitled';
      el.appendChild(title);

      if (tab.running) {
        const spin = document.createElement('span');
        spin.className = 'tab-spinner';
        spin.setAttribute('aria-label', 'Running');
        el.appendChild(spin);
      } else if (tab.dirty) {
        const dot = document.createElement('span');
        dot.className = 'tab-dirty';
        dot.setAttribute('aria-label', 'Unsaved changes');
        el.appendChild(dot);
      }

      const close = document.createElement('button');
      close.className = 'tab-close';
      close.type = 'button';
      close.setAttribute('aria-label', `Close ${tab.title || 'tab'}`);
      close.title = 'Close tab (⌘/Ctrl+W)';
      close.textContent = '×';
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        handlers.onClose?.(tab.id);
      });
      el.appendChild(close);

      el.addEventListener('click', () => handlers.onSelect?.(tab.id));
      el.addEventListener('auxclick', (e) => {
        if (e.button === 1) {
          e.preventDefault();
          handlers.onClose?.(tab.id);
        }
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handlers.onSelect?.(tab.id);
        }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'w') {
          e.preventDefault();
          handlers.onClose?.(tab.id);
        }
      });

      el.tabIndex = 0;
      el.title = `Tab ${idx + 1}: ${tab.title || 'Untitled'}`;
      list.appendChild(el);
    });
  }

  const unsubscribe = store.subscribe(render);
  return () => {
    unsubscribe();
    container.innerHTML = '';
  };
}