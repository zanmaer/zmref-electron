# ZmRef

A minimalist reference image viewer and organizer built with Electron.

## Features

- **Infinite Canvas**: Pan and zoom with smooth controls
- **Multi-Select**: Rubber band selection for batch operations
- **Frames**: Organize images into labeled containers
- **Alignment Tools**: Align and distribute selected images
- **Project Management**: Recent projects, auto-save configuration
- **Drag & Drop**: Import images by dropping files

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

## Supported Image Formats

PNG, JPG, JPEG, WebP, GIF, SVG

## Development

```bash
npm install
npm run dev    # Start in development mode
npm start      # Start Electron app
```

## Build

```bash
npm run build  # Production build (requires electron-builder)
```

## Project Structure

```
main.js      # Electron main process
preload.js   # Context bridge API
renderer.js  # App, Camera, ProjectManager, EntityManager, FrameManager
index.html   # DOM structure
style.css    # Styles
```

## Architecture

### Classes (renderer.js)

| Class | Responsibility |
|-------|----------------|
| **Camera** | Pan/zoom math, coordinate transforms |
| **ProjectManager** | File I/O, config loading/saving |
| **EntityManager** | Image lifecycle: create, drag, delete |
| **FrameManager** | Frame creation, resize, lock |
| **App** | Event coordination, UI state, shortcuts |

### IPC Channels

| Channel | Purpose |
|---------|---------|
| `dialog:openDirectory` | Open folder picker |
| `dialog:openFiles` | Open file picker |
| `fs:readFile`, `fs:writeFile`, `fs:deleteFile` | File I/O |
| `recent-projects:get/add/remove` | Recent projects |
| `files-dropped` | File drop notification |

## Configuration

Projects store state in `config.json`:

```json
{
  "canvas": { "cx": 0, "cy": 0, "zoom": 1 },
  "images": [{ "id": "uuid", "name": "file.png", "x": 100, "y": 200, "scale": 1 }],
  "frames": [{ "id": "uuid", "name": "Frame 1", "x": 200, "y": 200, "width": 300, "height": 200 }]
}
```

## License

MIT
