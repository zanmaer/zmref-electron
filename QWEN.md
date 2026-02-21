# ZmRef - Project Context

## Project Overview

**ZmRef** is a minimalist reference image viewer and organizer built with Electron. It provides an infinite canvas for organizing reference images with support for frames, alignment tools, and project management.

### Core Features
- **Infinite Canvas**: Pan and zoom with smooth controls (5000x5000px canvas)
- **Multi-Select**: Rubber band selection for batch operations
- **Frames**: Organize images into labeled, resizable containers
- **Alignment Tools**: Align and distribute selected images
- **Project Management**: Recent projects, auto-save configuration
- **Drag & Drop**: Import images by dropping files

### Supported Image Formats
PNG, JPG, JPEG, WebP, GIF, SVG

---

## Building and Running

### Prerequisites
- Node.js >= 18.0.0
- npm

### Dependencies
- `sharp` - High-performance image processing for thumbnail generation
- `electron` - Desktop application framework
- `electron-builder` - Packaging and distribution

### Commands

```bash
npm install        # Install dependencies
npm run dev        # Start in development mode
npm start          # Start Electron app (same as dev)
npm run build      # Production build (requires electron-builder)
npm run lint       # No linter configured
npm run test       # No tests configured
```

---

## Project Structure

```
main.js               # Electron main process: IPC handlers, window, menus
preload.js            # Context bridge API (security layer)
renderer.js           # App logic: Camera, ProjectManager, EntityManager, FrameManager, App
thumbnail-service.js  # Thumbnail generation service using Sharp
index.html            # DOM structure
style.css             # Styles with CSS variables
package.json          # Project config, scripts, dependencies
```

### Project Directory Structure

```
{project}/
├── config.json       # Project state: canvas, images, frames
├── files/            # Original image files ({uuid}.{ext})
└── thumbs/           # Thumbnail files ({uuid}.jpg, 800px max)
```

---

## Architecture

### Key Classes (renderer.js)

| Class | Responsibility |
|-------|----------------|
| **Camera** | Pan/zoom math, coordinate transforms, view state |
| **ProjectManager** | File I/O, config loading/saving, recent projects, thumbs directory |
| **EntityManager** | Image lifecycle: create, drag, delete, thumbnail loading |
| **FrameManager** | Frame creation, resize handles, lock state |
| **App** | Event coordination, UI state, shortcuts, memory monitoring |

### Main Process Modules

| Module | Responsibility |
|--------|----------------|
| **main.js** | IPC handlers, window management, menus, shell commands |
| **thumbnail-service.js** | Sharp-based thumbnail generation (800px max, JPEG) |

### IPC Communication

**Main Process (main.js)**: Handles IPC channels for file I/O, dialogs, window controls, and recent projects.

**Preload (preload.js)**: Exposes `window.api` with allowlisted channels via `contextBridge`.

**Key IPC Channels**:
| Channel | Purpose |
|---------|---------|
| `dialog:openDirectory` | Open folder picker |
| `dialog:openFiles` | Open file picker |
| `fs:readFile`, `fs:writeFile`, `fs:deleteFile` | File I/O |
| `window:minimize/maximize/close` | Window controls |
| `recent-projects:*` | Recent projects management |
| `files-dropped` | File drop notification |
| `thumbnail:generate` | Generate thumbnail from source image |
| `thumbnail:exists` | Check if thumbnail file exists |
| `thumbnail:getPath` | Get thumbnail path for image ID |
| `thumbnail:delete` | Delete thumbnail file |
| `thumbnail:ensureThumbsDir` | Ensure thumbs directory exists |
| `thumbnail:ensure` | Generate thumbnail if missing (atomic) |

### Project Config Structure

Projects store state in `config.json`:

```json
{
  "canvas": { "cx": 0, "cy": 0, "zoom": 1 },
  "images": [
    {
      "id": "uuid",
      "name": "uuid.png",
      "thumbName": "uuid.jpg",
      "x": 100,
      "y": 200,
      "scale": 1
    }
  ],
  "frames": [
    {
      "id": "uuid",
      "name": "Frame 1",
      "x": 200,
      "y": 200,
      "width": 300,
      "height": 200
    }
  ]
}
```

**Image Data Structure**:
| Field | Type | Description |
|-------|------|-------------|
| `id` | string | UUID for the image |
| `name` | string | Original filename in `files/` directory |
| `thumbName` | string | Thumbnail filename in `thumbs/` directory (optional) |
| `x`, `y` | number | Canvas position |
| `scale` | number | Scale multiplier (1.0 = original size) |

---

## Development Conventions

### Code Style

| Aspect | Convention |
|--------|------------|
| **Language** | Vanilla JavaScript (ES6+), no frameworks |
| **Indentation** | 2 spaces (no tabs) |
| **Quotes** | Single quotes preferred |
| **Semicolons** | Always use semicolons |
| **Line length** | Max 100 characters |
| **Logging** | Use `[PREFIX]` format: `[App]`, `[Camera]`, `[MAIN]`, `[RENDERER]` |

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Classes | PascalCase | `Camera`, `FrameManager` |
| Methods/variables | camelCase | `saveConfig()`, `_handleResize()` |
| Constants | UPPER_SNAKE_CASE | `IMAGE_EXTENSIONS`, `CONSTANTS` |
| Private methods | Underscore prefix | `_handleResize()` |
| CSS classes | Kebab-case | `.canvas-image` |

### Constants Pattern

Group constants in a frozen object at module top:

```javascript
const CONSTANTS = Object.freeze({
  DEFAULT_ZOOM: 1,
  MIN_ZOOM: 0.05,
  MAX_ZOOM: 5,
  THUMBNAIL: Object.freeze({
    MAX_SIZE: 800,
    DIR_NAME: 'thumbs',
    FORMAT: 'jpeg',
    QUALITY: 85
  }),
  // ...
});
```

### Thumbnail Service Pattern

**Main Process** (`thumbnail-service.js`): Uses Sharp for image processing.

```javascript
const sharp = require('sharp');

// Generate thumbnail (800px max, JPEG)
async function generateThumbnail(srcPath, destPath, maxSize = 800) {
  // CRITICAL: Ensure parent directory exists first
  const destDir = path.dirname(destPath);
  await fs.mkdir(destDir, { recursive: true });

  await sharp(srcPath)
    .resize(maxSize, maxSize, { fit: 'inside' })
    .jpeg({ quality: 85 })
    .toFile(destPath);
}
```

**Key Points**:
- Sharp does NOT create directories automatically - always call `mkdir` first
- Use `fit: 'inside'` for aspect-ratio-preserving resize to max dimension
- All images normalized to 800px on longest side (even smaller images)
- Thumbnails always JPEG format for consistency
- Original files preserved in `files/` for "Open in Explorer"

### Security Requirements

- **Always**: `contextIsolation: true`, `nodeIntegration: false`, `webSecurity: true`
- **Never**: Enable `nodeIntegration` in renderer
- **Validate**: All IPC inputs in main process using `isValidPath()` function
- **Allowlist**: Only expose specific channels in preload.js

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Space (hold) | Pan mode |
| Delete / Backspace | Delete selected |
| Ctrl+0 | Reset zoom 100% |
| Ctrl+A | Select all |
| Escape | Clear selection |
| Mouse wheel | Zoom at cursor |
| Right-click | Context menu |

---

## Memory Management

- Use offscreen image unloading for large projects (>100 images)
- Monitor heap via `window.performance.memory`
- Trigger cleanup at 70% threshold (`MEMORY_WARNING_THRESHOLD`)
- Always clear image `src` before removing elements
- Call `window.gc()` after clearing entities (if available)

---

## Common Tasks

### Adding a New IPC Channel

1. Add handler in `main.js` with validation and error handling
2. Add API method in `preload.js` under appropriate namespace
3. Call from `renderer.js` via `window.api.channel()`
4. Add channel to `ALLOWED_CHANNELS` in preload if event-based

### IPC Handler Pattern (main.js)

```javascript
ipcMain.handle('channel:name', async (event, ...args) => {
  try {
    if (!isValidPath(args[0])) throw new Error('Invalid argument');
    const result = await doWork(args);
    return { success: true, data: result };
  } catch (error) {
    console.error('[IPC] channel:name error:', error.message);
    return { success: false, error: error.message };
  }
});
```

### Preload API Pattern (preload.js)

```javascript
contextBridge.exposeInMainWorld('api', {
  channel: (...args) => ipcRenderer.invoke('channel:name', ...args),
  onEvent: (callback) => {
    const handler = (e, d) => callback(d);
    ipcRenderer.on('event:name', handler);
    listenersMap.set('event:name', handler);
  }
});
```

### Debouncing Config Saves

```javascript
saveTimeout = setTimeout(async () => {
  // save logic
}, CONSTANTS.DEBOUNCE_DELAY_MS);
```

---

## Development Tips

### Debugging
- Check console output with `[MAIN]`, `[RENDERER]`, `[App]`, `[ThumbnailService]` prefixes
- Use `window.performance.memory` to monitor heap usage
- Render process crashes trigger recovery mode automatically
- Thumbnail errors logged as `[EntityManager] Failed to generate thumbnail`

### Canvas Positioning
- Default canvas: 5000x5000px (defined in style.css)
- Position entities using `transform: translate()` not left/top
- Use `will-change: transform` only during drag operations
- **Important**: Round all coordinates to prevent subpixel rendering artifacts

### GPU Acceleration (style.css)

To prevent visual artifacts (white lines), elements use:
```css
-webkit-transform: translateZ(0);
transform: translateZ(0);
-webkit-backface-visibility: hidden;
backface-visibility: hidden;
image-rendering: crisp-edges;
```

### Z-Index Layering

Elements are layered using z-index to ensure correct visual stacking:

| Element | Z-Index | Description |
|---------|---------|-------------|
| `.frame-container` | `1` | Frames are always below images |
| `.canvas-image` | `10` | Images appear above frames |
| `.canvas-text` | `20` | Text labels appear above images |
| `.frame-label` | `5` | Frame labels (positioned above frame) |
| `.selection-rect` | `1000` | Selection rectangle (topmost) |

**Note**: Frames use `zIndex: 1` in code to stay below images. The `bringToFront()` function increments from base 1.

---

### Thumbnail Development

**Adding a new image with thumbnail**:
```javascript
// renderer.js - EntityManager.addImageFromFile()
const thumbResult = await window.api.thumbnail.ensure(srcPath, thumbsDir, id);
if (!thumbResult.success) {
  console.error('[EntityManager] Failed to generate thumbnail:', thumbResult.error);
}
// Fallback: entity loads without thumbnail (uses original)
```

**Common Issues**:
| Issue | Solution |
|-------|----------|
| `unable to open for write` | Ensure directory exists with `fs.mkdir(dir, { recursive: true })` |
| Thumbnail not displaying | Check `thumbName` field in config, verify file exists in `thumbs/` |
| Original opens instead | Verify `thumbName` is set, check `createEntity()` logic |
| `path argument must be of type string` | Ensure `projectPath` is set before calling `getThumbsDir()` |

### Recent Bug Fixes

**v1.1.0** (Commit `a830bdc`):
- Fixed thumbnail directory creation error (`unable to open for write`)
  - Added `fs.mkdir(destDir, { recursive: true })` before `sharp().toFile()`
  - Added defensive check in `ensureThumbnail()` to create thumbs directory
- Fixed frames overlapping images
  - Changed frame default `zIndex` from `100` to `1`
  - Updated `bringToFront()` to use base z-index of `1`
  - Added explicit `z-index: 1` to `.frame-container` in CSS

---

## Testing

No test suite is currently configured. When adding tests:
- Use Jest as the testing framework
- Place test files in `test/` directory
- Follow existing naming conventions

### Thumbnail Testing Checklist
- [ ] Verify `thumbs/` directory created on first image add
- [ ] Verify thumbnail is 800px on longest dimension
- [ ] Verify "Open in Explorer" opens original (not thumbnail)
- [ ] Verify thumbnail deleted when image deleted
- [ ] Verify fallback to original if thumbnail generation fails

---

## Related Documentation

- `README.md` - User-facing documentation
