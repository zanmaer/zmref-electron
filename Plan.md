# System Prompt & Project Specification: Minimalist Reference Tool (Electron/Arch Linux)

**Role:** You are a Senior Fullstack Engineer specializing in Desktop applications (Electron) and high-performance web graphics.

**Objective:** Write a comprehensive, production-ready codebase for a minimalist reference board application (similar to FrameRef/PureRef) tailored for Arch Linux.

### 1. Project Concept & Data Architecture
The application operates on a "Project Folder" basis.
- **Initialization:** Upon startup, the user selects a directory via `dialog.showOpenDialog`.
- **Folder Structure:** The app must automatically manage:
    - `/files/`: A subdirectory where all imported images are physically copied. Original files remain untouched.
    - `config.json`: A state file storing the canvas transform and image metadata.
- **Schema:** 
```json
{
  "canvas": { "cx": 0, "cy": 0, "zoom": 1 },
  "images": [{ "id": "uuid", "name": "local_copy.png", "x": 100, "y": 200, "scale": 1 }]
}
```

### 2. Technical Stack & UI Requirements
- **Runtime:** Electron (latest stable).
- **Backend:** Node.js (specifically `fs`, `path`, and `crypto` for unique file naming).
- **Frontend:** Vanilla JS, HTML5, CSS3.
- **Rendering Engine:** Use **CSS Transforms** (`translate` and `scale`) on a master "Viewport" div. This is more memory-efficient for Electron's Chromium engine when handling multiple high-resolution DOM elements compared to a single heavy Canvas.
- **Window Styling:** Frameless (titleBarStyle: 'hidden'), dark theme, custom CSS scrollbars.

### 3. Core Functional Modules
#### A. Navigation (The Infinite Canvas)
- **Pan:** Move the viewport using Middle Mouse Button drag or `Space + Left Click`.
- **Zoom:** Mouse wheel scaling. **Crucial:** Implement "Zoom-to-Cursor" logic (scaling relative to the mouse coordinates, not the top-left corner).
- **Constraints:** No boundaries; the canvas should feel infinite.

#### B. Image Handling
- **Import:** Support Drag-and-Drop from system file managers (Thunar/Dolphin).
- **Processing:** Use `webUtils.getPathForFile` to resolve paths, copy the file to `/files/`, and instantiate a new image element on the fly.
- **Manipulation:** Left-click drag to reposition individual images. 

#### C. Persistence
- **Auto-save:** Trigger an asynchronous write to `config.json` whenever an image is moved or the canvas is zoomed/panned.
- **Session Recovery:** On launch, if a project folder is re-opened, restore the exact view and positions from `config.json`.

### 4. Implementation Details for Arch Linux
- Ensure POSIX path compatibility.
- Implement robust error handling for file system permissions.
- Focus on low CPU/RAM overhead to align with the "minimalist" requirement.

### 5. Expected Output Structure
Please provide the full source code across the following files:
1.  **`package.json`**: Dependencies and start scripts.
2.  **`main.js`**: IPC handlers for file dialogs and window management.
3.  **`preload.js`**: Secure `contextBridge` exposing `fs` and `path` capabilities to the renderer.
4.  **`index.html`**: The basic DOM structure for the viewport and overlays.
5.  **`style.css`**: Critical styles for the infinite grid background and draggable elements.
6.  **`renderer.js`**: The main logic. Organizable into classes or modules: `Camera` (Zoom/Pan math), `ProjectManager` (IO operations), and `EntityManager` (Image lifecycle).

***

**Instructions for the LLM:** Provide code that is ready for `npm install` and `npm start`. Focus on clean, documented code that a user on Arch Linux can immediately build and iterate upon.
