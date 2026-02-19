# AGENTS.md - ZmRef Electron

## Build & Run Commands

```bash
npm install
npm run dev    # Start in development mode
npm start      # Start Electron app
npm run build  # Production build (requires electron-builder)
```

---

## Code Style

### General Rules
- **Language**: Vanilla JavaScript (ES6+), no frameworks
- **Indentation**: 2 spaces
- **Quotes**: Single quotes preferred
- **Semicolons**: Always use semicolons
- **Line length**: Max 100 characters
- **Files**: UTF-8 encoding

### Naming Conventions
| Type | Convention | Example |
|------|------------|---------|
| Classes | PascalCase | `Camera`, `FrameManager`, `HistoryManager` |
| Methods/variables | camelCase | `this.cx`, `saveConfig()`, `_isExecuting` |
| Constants | UPPER_SNAKE_CASE | `IMAGE_EXTENSIONS`, `HISTORY_MAX_SIZE` |
| Private methods | prefix underscore | `_handleResize()`, `_createElement()` |

### File Structure
```
main.js      # Electron main: IPC, window, menus
preload.js   # contextBridge API to renderer
renderer.js  # All app classes (App, Camera, Managers, Commands)
index.html   # DOM structure
style.css    # Styles with CSS variables
```

### ES6 Class Patterns
```javascript
class MyClass {
  constructor(param) {
    this.prop = param;
    this._privateState = null;
  }

  publicMethod() { return this._privateMethod(); }
  _privateMethod() { return this.prop; }
}
```

### Error Handling
- Always use try/catch in async IPC handlers
- Return `{ success: true, data: result }` on success
- Return `{ success: false, error: error.message }` on failure
- Log errors with prefix: `[CLASSNAME] methodName error: message`

---

## Architecture

### Key Classes (renderer.js)
| Class | Responsibility |
|-------|----------------|
| **App** | Event coordination, UI state, keyboard shortcuts |
| **Camera** | Pan/zoom math, coordinate transforms |
| **ProjectManager** | File I/O, config loading/saving |
| **EntityManager** | Image lifecycle: create, drag, delete, z-order |
| **FrameManager** | Frame creation, resize handles, lock state |
| **HistoryManager** | Undo/redo stacks, command execution |

### Command Pattern (Undo/Redo)
| Class | Purpose |
|-------|---------|
| `CommandGroup` | Groups multiple commands as single undo |
| `AddImageCommand` | Add image to project |
| `DeleteImageCommand` | Remove image from project |
| `MoveImageCommand` | Move single image position |
| `MoveImagesCommand` | Move multiple images (grouped) |
| `ScaleImageCommand` | Resize image |
| `AddFrameCommand` | Create new frame |
| `MoveFrameCommand` | Move frame position |
| `ResizeFrameCommand` | Resize frame dimensions |

---

## IPC Communication

### Main Process (main.js)
```javascript
ipcMain.handle('channel:name', async (event, ...args) => {
  try {
    if (!args[0]) throw new Error('Invalid argument');
    const result = await doWork(args);
    return { success: true, data: result };
  } catch (error) {
    console.error('[MAIN] channel:name error:', error.message);
    return { success: false, error: error.message };
  }
});
```

### Preload (preload.js)
```javascript
contextBridge.exposeInMainWorld('api', {
  channel: (...args) => ipcRenderer.invoke('channel:name', ...args),
  onEvent: (callback) => ipcRenderer.on('event:name', (e, d) => callback(d)),
  removeEvent: (channel) => ipcRenderer.removeAllListeners(channel)
});
```

### Key IPC Channels
| Channel | Direction | Purpose |
|---------|-----------|---------|
| `dialog:openDirectory` | renderer→main | Open folder picker |
| `dialog:openFiles` | renderer→main | Open file picker |
| `fs:readFile`, `fs:writeFile`, `fs:deleteFile` | renderer→main | File I/O |
| `window:minimize/maximize/close` | renderer→main | Window controls |
| `recent-projects:*` | renderer→main | Recent projects management |
| `files-dropped` | main→renderer | File drop notification |

---

## Security

- **Always**: `contextIsolation: true`, `nodeIntegration: false`
- **Never**: Enable `nodeIntegration` in renderer
- **Validate**: All IPC inputs in main process before use
- **WebSecurity**: `false` only for `file://` protocol

---

## Logging Prefix

| Prefix | File |
|--------|------|
| `[MAIN]` | main.js |
| `[RENDERER]` | renderer.js |
| `[Camera]`, `[ProjectManager]` | Specific class in renderer.js |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Space (hold) | Pan mode |
| Delete/Backspace | Delete selected |
| Ctrl+0 | Reset zoom 100% |
| Ctrl+A | Select all |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z | Redo |
| Escape | Clear selection |
| Mouse wheel | Zoom at cursor |
| Right-click | Context menu |
