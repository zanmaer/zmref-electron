# AGENTS.md - ZmRef Electron Project

## Build & Run Commands

```bash
npm install
npm run dev    # or npm start

# Lint (add to package.json: "lint": "eslint .")
npm run lint
npm run lint -- --fix

# Tests (add Jest to package.json)
npm test
npm test -- --watch
npm test -- --testPathPattern=filename  # single test
```

## Code Style

- Vanilla JS (ES6+), no frameworks
- 2 spaces indentation, single quotes, semicolons
- ES6 classes: constructor → public methods → _private methods
- Naming: PascalCase (classes), camelCase (methods/vars), UPPER_SNAKE_CASE (constants)
- DOM IDs: lowercase with hyphens (`btn-open-project`)
- CSS classes: lowercase with hyphens

## Architecture

```
main.js      # IPC handlers, window config
preload.js   # contextBridge API
renderer.js  # Camera, ProjectManager, EntityManager, App
index.html   # DOM structure
style.css    # Styles with GPU optimizations
```

## IPC Communication

### Main Process
```javascript
ipcMain.handle('channel:name', async (event, ...args) => {
  try {
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

### Preload
```javascript
contextBridge.exposeInMainWorld('api', {
  channel: (...args) => ipcRenderer.invoke('channel:name', ...args),
  onEvent: (callback) => ipcRenderer.on('event:name', (e, d) => callback(d))
});
```

### Available Channels
| Channel | Purpose |
|---------|---------|
| dialog:openDirectory/openFiles | File/folder pickers |
| fs:* | readFile, writeFile, copyFile, mkdir, exists |
| path:* | join, basename, extname, toFileURL |
| window:* | minimize, maximize, close |
| files-dropped | Main→renderer file notifications |
| context-menu-action | Context menu actions |

## Common Patterns

### Debounced Save
```javascript
saveTimeout = null;
saveConfig() {
  if (this.saveTimeout) return;
  this.saveTimeout = setTimeout(async () => {
    try { /* save logic */ } finally { this.saveTimeout = null; }
  }, 500);
}
```

### Event Listener Cleanup
```javascript
setupEntityEvents(element) {
  const onEvent = (e) => { /* handler */ };
  element.addEventListener('event', onEvent);
  element._cleanup = () => {
    element.removeEventListener('event', onEvent);
    delete element._cleanup;
  };
}
```

### Zoom-to-Cursor
```javascript
zoomToPoint(delta, screenX, screenY, viewportRect) {
  const mouseX = screenX - viewportRect.left;
  const worldX = (mouseX - this.cx) / this.zoom;
  this.zoom = Math.max(min, Math.min(max, this.zoom * factor));
  this.cx = mouseX - worldX * this.zoom;
}
```

## Key Classes

- **Camera**: Pan/zoom math, CSS transform
- **ProjectManager**: File I/O, debounced saves
- **EntityManager**: Image lifecycle, drag handling
- **App**: Event coordination, UI state

## Security

- Always `contextIsolation: true`
- Never `nodeIntegration: true`
- Validate IPC inputs in main process
- Use `webSecurity: false` only for local file loading

## Debugging

- Logs: `[MAIN]`, `[RENDERER]`, `[IPC]`
- Check DevTools: `Ctrl+Shift+I`

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Space (hold) | Pan mode |
| Delete/Backspace | Delete image |
| Ctrl+0 | Reset zoom |
| Mouse wheel | Zoom |
| Right-click | Context menu |

## Future Improvements

- Image scaling/resizing
- More keyboard shortcuts
- Zoom presets
