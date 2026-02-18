const DEBOUNCE_DELAY_MS = 500;
const WHEEL_THROTTLE_MS = 16;
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'];
const DEFAULT_IMAGE_POSITION = { x: 100, y: 100 };
const POSITION_RANDOM_RANGE = 200;

class Camera {
  constructor() {
    this.cx = 0;
    this.cy = 0;
    this.zoom = 1;
    this.minZoom = 0.1;
    this.maxZoom = 5;
  }

  applyToElement(element) {
    element.style.transform = `translate(${this.cx}px, ${this.cy}px) scale(${this.zoom})`;
  }

  screenToCanvas(screenX, screenY) {
    return {
      x: (screenX - this.cx) / this.zoom,
      y: (screenY - this.cy) / this.zoom
    };
  }

  pan(dx, dy) {
    this.cx += dx;
    this.cy += dy;
  }

  zoomToPoint(delta, screenX, screenY, viewportRect) {
    const mouseX = screenX - viewportRect.left;
    const mouseY = screenY - viewportRect.top;

    const zoomFactor = delta > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * zoomFactor));

    if (newZoom === this.zoom) return;

    const worldX = (mouseX - this.cx) / this.zoom;
    const worldY = (mouseY - this.cy) / this.zoom;

    this.zoom = newZoom;
    this.cx = mouseX - worldX * this.zoom;
    this.cy = mouseY - worldY * this.zoom;
  }

  reset() {
    this.cx = 0;
    this.cy = 0;
    this.zoom = 1;
  }

  getState() {
    return { cx: this.cx, cy: this.cy, zoom: this.zoom };
  }

  setState(state) {
    if (state) {
      this.cx = state.cx || 0;
      this.cy = state.cy || 0;
      this.zoom = state.zoom || 1;
    }
  }
}

class ProjectManager {
  constructor() {
    this.projectPath = null;
    this.config = {
      canvas: { cx: 0, cy: 0, zoom: 1 },
      images: []
    };
    this.saveTimeout = null;
  }

  async openProject() {
    const projectPath = await window.api.dialog.openDirectory();
    if (!projectPath) return null;

    this.projectPath = projectPath;
    await this.ensureFilesDir();
    await this.loadConfig();
    return this.projectPath;
  }

  async ensureFilesDir() {
    const filesDir = await window.api.fs.getFilesDir(this.projectPath);
    const result = await window.api.fs.mkdir(filesDir);
    if (!result.success) {
      console.error('[ProjectManager] Failed to create files directory:', result.error);
      return false;
    }
    
    const exists = await window.api.fs.exists(filesDir);
    console.log('[ProjectManager] Files dir exists:', exists);
    return exists;
  }

  async loadConfig() {
    const configPath = await window.api.fs.getConfigPath(this.projectPath);
    const exists = await window.api.fs.exists(configPath);

    if (exists) {
      const result = await window.api.fs.readFile(configPath);
      if (result.success) {
        try {
          this.config = JSON.parse(result.data);
        } catch (e) {
          console.error('[ProjectManager] Failed to parse config:', e);
          this.resetConfig();
        }
      } else {
        console.error('[ProjectManager] Failed to read config:', result.error);
        this.resetConfig();
      }
    } else {
      this.resetConfig();
    }
  }

  resetConfig() {
    this.config = {
      canvas: { cx: 0, cy: 0, zoom: 1 },
      images: []
    };
  }

  async saveConfig() {
    if (!this.projectPath) return;
    
    if (this.saveTimeout) return;
    
    this.saveTimeout = setTimeout(async () => {
      try {
        const configPath = await window.api.fs.getConfigPath(this.projectPath);
        const result = await window.api.fs.writeFile(configPath, JSON.stringify(this.config, null, 2));
        if (!result.success) {
          console.error('[ProjectManager] Failed to save config:', result.error);
        }
      } catch (error) {
        console.error('[ProjectManager] Error saving config:', error);
      } finally {
        this.saveTimeout = null;
      }
    }, DEBOUNCE_DELAY_MS);
  }

  async saveConfigNow() {
    if (!this.projectPath) return;
    
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    
    try {
      const configPath = await window.api.fs.getConfigPath(this.projectPath);
      const result = await window.api.fs.writeFile(configPath, JSON.stringify(this.config, null, 2));
      if (!result.success) {
        console.error('[ProjectManager] Failed to save config:', result.error);
      }
    } catch (error) {
      console.error('[ProjectManager] Error saving config:', error);
    }
  }

  getConfig() {
    return this.config;
  }

  updateCanvas(state) {
    this.config.canvas = state;
    this.saveConfig();
  }

  addImage(imageData) {
    this.config.images.push(imageData);
    this.saveConfig();
  }

  updateImage(id, data) {
    const img = this.config.images.find(i => i.id === id);
    if (img) {
      Object.assign(img, data);
      this.saveConfig();
    }
  }

  removeImage(id) {
    this.config.images = this.config.images.filter(i => i.id !== id);
    this.saveConfig();
  }

  async getFilesDir() {
    return window.api.fs.getFilesDir(this.projectPath);
  }

  getProjectPath() {
    return this.projectPath;
  }
}

class EntityManager {
  constructor(camera, projectManager, canvasEl) {
    this.camera = camera;
    this.projectManager = projectManager;
    this.canvas = canvasEl;
    this.entities = new Map();
    this.dragState = {
      isDragging: false,
      entity: null,
      startX: 0,
      startY: 0,
      offsetX: 0,
      offsetY: 0,
      currentX: null,
      currentY: null
    };
  }

  async addImageFromFile(filePath) {
    console.log('[EntityManager] addImageFromFile() called with:', filePath);
    
    const id = await window.api.crypto.randomUUID();
    const ext = await window.api.path.extname(filePath);
    const basename = await window.api.path.basename(filePath);
    const filesDir = await this.projectManager.getFilesDir();
    console.log('[EntityManager] Files dir:', filesDir);
    
    const uniqueName = `${id}${ext}`;
    const destPath = await window.api.path.join(filesDir, uniqueName);
    console.log('[EntityManager] Destination path:', destPath);

    const result = await window.api.fs.copyFile(filePath, destPath);
    console.log('[EntityManager] Copy result:', result);
    if (!result.success) {
      console.error('[EntityManager] Failed to copy file:', result.error);
      return null;
    }

    const imageData = {
      id,
      name: uniqueName,
      x: DEFAULT_IMAGE_POSITION.x + Math.random() * POSITION_RANDOM_RANGE,
      y: DEFAULT_IMAGE_POSITION.y + Math.random() * POSITION_RANDOM_RANGE,
      scale: 1
    };

    this.projectManager.addImage(imageData);
    await this.createEntity(imageData);

    return imageData;
  }

  async createEntity(imageData) {
    const img = document.createElement('img');
    img.className = 'canvas-image';
    img.dataset.id = imageData.id;
    img.draggable = false;

    const filesDir = await this.projectManager.getFilesDir();
    const fullPath = await window.api.path.join(filesDir, imageData.name);
    const fileURL = await window.api.path.toFileURL(fullPath);
    img.src = fileURL;

    img.style.left = `${imageData.x}px`;
    img.style.top = `${imageData.y}px`;
    img.style.transform = `scale(${imageData.scale})`;

    this.setupEntityEvents(img, imageData);

    img.onerror = () => {
      console.error('[EntityManager] Failed to load image:', imageData.name, '- Path:', fullPath);
      img.classList.add('load-error');
    };

    this.canvas.appendChild(img);
    this.entities.set(imageData.id, { element: img, data: imageData });

    return img;
  }

  setupEntityEvents(element, imageData) {
    const onMouseDown = (e) => {
      if (e.button === 0) {
        e.preventDefault();
        e.stopPropagation();
        this.startDrag(e, element, imageData);
      }
    };

    const onContextMenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

    element.addEventListener('mousedown', onMouseDown);
    element.addEventListener('contextmenu', onContextMenu);

    element._cleanup = () => {
      element.removeEventListener('mousedown', onMouseDown);
      element.removeEventListener('contextmenu', onContextMenu);
      delete element._cleanup;
    };
  }

  startDrag(e, element, imageData) {
    this.dragState.isDragging = true;
    this.dragState.entity = element;
    this.dragState.startX = e.clientX;
    this.dragState.startY = e.clientY;
    this.dragState.offsetX = imageData.x;
    this.dragState.offsetY = imageData.y;
    
    element.classList.add('dragging');
  }

  handleDrag(e) {
    if (!this.dragState.isDragging || !this.dragState.entity) return;

    const dx = (e.clientX - this.dragState.startX) / this.camera.zoom;
    const dy = (e.clientY - this.dragState.startY) / this.camera.zoom;

    const newX = this.dragState.offsetX + dx;
    const newY = this.dragState.offsetY + dy;

    this.dragState.entity.style.left = `${newX}px`;
    this.dragState.entity.style.top = `${newY}px`;
    
    this.dragState.currentX = newX;
    this.dragState.currentY = newY;
  }

  endDrag() {
    if (this.dragState.entity && this.dragState.currentX !== null) {
      const id = this.dragState.entity.dataset.id;
      this.projectManager.updateImage(id, { 
        x: this.dragState.currentX, 
        y: this.dragState.currentY 
      });
      this.dragState.entity.classList.remove('dragging');
    }
    this.dragState.isDragging = false;
    this.dragState.entity = null;
    this.dragState.currentX = null;
    this.dragState.currentY = null;
  }

  deleteEntity(id) {
    const entity = this.entities.get(id);
    if (entity) {
      if (entity._cleanup) entity._cleanup();
      entity.element.remove();
      this.entities.delete(id);
      this.projectManager.removeImage(id);
    }
  }

  async loadAllImages() {
    const config = this.projectManager.getConfig();
    const filesDir = await this.projectManager.getFilesDir();
    
    for (const imageData of config.images) {
      const fullPath = await window.api.path.join(filesDir, imageData.name);
      const exists = await window.api.fs.exists(fullPath);
      
      if (exists) {
        await this.createEntity(imageData);
      } else {
        console.warn('[EntityManager] Image file not found, skipping:', imageData.name);
      }
    }
  }

  clearAll() {
    this.entities.forEach(({ element, element: { _cleanup } }) => {
      if (_cleanup) _cleanup();
      element.remove();
    });
    this.entities.clear();
  }

  getEntity(id) {
    return this.entities.get(id);
  }
}

class App {
  constructor() {
    this.viewport = document.getElementById('viewport');
    this.canvas = document.getElementById('canvas');
    this.welcomeOverlay = document.getElementById('welcome-overlay');
    this.statusZoom = document.getElementById('status-zoom');
    this.statusProject = document.getElementById('status-project');
    this.btnOpenProject = document.getElementById('btn-open-project');
    this.dropStatus = document.getElementById('drop-status');
    this.btnMinimize = document.getElementById('btn-minimize');
    this.btnMaximize = document.getElementById('btn-maximize');
    this.btnClose = document.getElementById('btn-close');

    this.camera = new Camera();
    this.projectManager = new ProjectManager();
    this.entityManager = new EntityManager(this.camera, this.projectManager, this.canvas);

    this.panState = {
      isPanning: false,
      startX: 0,
      startY: 0,
      startCx: 0,
      startCy: 0,
      spacePressed: false
    };

    this.lastWheelTime = 0;
    this.boundHandlers = {
      handleWheel: this.handleWheel.bind(this),
      handleMouseDown: this.handleMouseDown.bind(this),
      handleMouseMove: this.handleMouseMove.bind(this),
      handleMouseUp: this.handleMouseUp.bind(this),
      handleKeyDown: this.handleKeyDown.bind(this),
      handleKeyUp: this.handleKeyUp.bind(this),
      handleDragOver: this.handleDragOver.bind(this),
      handleDrop: this.handleDrop.bind(this)
    };

    this.setupEventListeners();
    this.updateCanvasTransform();
  }

  setupEventListeners() {
    this.btnOpenProject.addEventListener('click', () => this.openProject());
    this.btnMinimize.addEventListener('click', () => window.api.window.minimize());
    this.btnMaximize.addEventListener('click', () => window.api.window.maximize());
    this.btnClose.addEventListener('click', () => window.api.window.close());

    this.viewport.addEventListener('wheel', this.boundHandlers.handleWheel, { passive: false });
    this.viewport.addEventListener('mousedown', this.boundHandlers.handleMouseDown);
    this.viewport.addEventListener('dragover', this.boundHandlers.handleDragOver);
    this.viewport.addEventListener('drop', this.boundHandlers.handleDrop);

    document.addEventListener('mousemove', this.boundHandlers.handleMouseMove);
    document.addEventListener('mouseup', this.boundHandlers.handleMouseUp);
    document.addEventListener('keydown', this.boundHandlers.handleKeyDown);
    document.addEventListener('keyup', this.boundHandlers.handleKeyUp);
  }

  async ensureProjectOpen() {
    if (this.projectManager.getProjectPath()) {
      console.log('[App] Project already open:', this.projectManager.getProjectPath());
      return true;
    }

    console.log('[App] No project open, opening dialog...');
    const path = await this.projectManager.openProject();
    console.log('[App] Project opened:', path);
    if (!path) return false;

    this.welcomeOverlay.classList.remove('active');
    this.statusProject.textContent = path;
    
    const config = this.projectManager.getConfig();
    this.camera.setState(config.canvas);
    this.updateCanvasTransform();
    
    await this.entityManager.loadAllImages();
    return true;
  }

  async openProject() {
    const path = await this.projectManager.openProject();
    if (!path) return;

    this.welcomeOverlay.classList.remove('active');
    this.statusProject.textContent = path;

    const config = this.projectManager.getConfig();
    this.camera.setState(config.canvas);
    this.updateCanvasTransform();

    await this.entityManager.loadAllImages();
  }

  async addImages() {
    console.log('[App] addImages() called');
    try {
      const hasProject = await this.ensureProjectOpen();
      console.log('[App] Project open:', hasProject);
      if (!hasProject) return;

      const filePaths = await window.api.dialog.openFiles();
      console.log('[App] File paths returned:', filePaths);
      if (!filePaths || filePaths.length === 0) {
        console.log('[App] No files selected or dialog canceled');
        return;
      }

      for (const filePath of filePaths) {
        console.log('[App] Processing file:', filePath);
        const result = await this.entityManager.addImageFromFile(filePath);
        console.log('[App] File added result:', result);
      }

      this.updateCanvasTransform();
    } catch (error) {
      console.error('[App] Error in addImages():', error);
    }
  }

  handleWheel(e) {
    e.preventDefault();

    const now = performance.now();
    if (now - this.lastWheelTime < WHEEL_THROTTLE_MS) return;
    this.lastWheelTime = now;

    const rect = this.viewport.getBoundingClientRect();
    this.camera.zoomToPoint(e.deltaY, e.clientX, e.clientY, rect);
    this.updateCanvasTransform();
    this.projectManager.updateCanvas(this.camera.getState());
    this.updateStatus();
  }

  handleMouseDown(e) {
    if (e.button === 1 || (e.button === 0 && this.panState.spacePressed)) {
      e.preventDefault();
      this.startPan(e);
    } else if (e.button === 0 && e.target === this.viewport) {
      this.entityManager.endDrag();
    }
  }

  handleMouseMove(e) {
    if (this.panState.isPanning) {
      this.updatePan(e);
    } else if (this.entityManager.dragState.isDragging) {
      this.entityManager.handleDrag(e);
    }
  }

  handleMouseUp() {
    if (this.panState.isPanning) {
      this.endPan();
    }
    this.entityManager.endDrag();
  }

  handleKeyDown(e) {
    if (e.code === 'Space' && !this.panState.spacePressed) {
      this.panState.spacePressed = true;
      this.viewport.classList.add('pan-mode');
    } else if (e.code === 'Delete' || e.code === 'Backspace') {
      const draggingEntity = this.entityManager.dragState.entity;
      if (draggingEntity) {
        const id = draggingEntity.dataset.id;
        this.entityManager.deleteEntity(id);
      }
    } else if (e.code === 'Digit0' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.camera.reset();
      this.updateCanvasTransform();
      this.projectManager.updateCanvas(this.camera.getState());
      this.updateStatus();
    }
  }

  handleKeyUp(e) {
    if (e.code === 'Space') {
      this.panState.spacePressed = false;
      this.viewport.classList.remove('pan-mode');
    }
  }

  handleDragOver(e) {
    e.preventDefault();
  }

  async handleDrop(e) {
    e.preventDefault();

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const hasProject = await this.ensureProjectOpen();
    if (!hasProject) return;

    for (const file of files) {
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (IMAGE_EXTENSIONS.includes(ext)) {
        await this.entityManager.addImageFromFile(file.path);
      }
    }

    this.updateCanvasTransform();
  }

  startPan(e) {
    this.panState.isPanning = true;
    this.panState.startX = e.clientX;
    this.panState.startY = e.clientY;
    this.panState.startCx = this.camera.cx;
    this.panState.startCy = this.camera.cy;
    this.viewport.classList.add('panning');
  }

  updatePan(e) {
    const dx = e.clientX - this.panState.startX;
    const dy = e.clientY - this.panState.startY;

    this.camera.cx = this.panState.startCx + dx;
    this.camera.cy = this.panState.startCy + dy;

    this.updateCanvasTransform();
  }

  endPan() {
    this.panState.isPanning = false;
    this.viewport.classList.remove('panning');
    this.projectManager.updateCanvas(this.camera.getState());
  }

  updateCanvasTransform() {
    this.camera.applyToElement(this.canvas);
    this.updateStatus();
  }

  updateStatus() {
    this.statusZoom.textContent = `${Math.round(this.camera.zoom * 100)}%`;
  }

  resetZoom() {
    this.camera.reset();
    this.updateCanvasTransform();
    this.projectManager.updateCanvas(this.camera.getState());
    this.updateStatus();
  }

  async handleFilesFromIPC(paths) {
    if (!paths || paths.length === 0) return;

    const hasProject = await this.ensureProjectOpen();
    if (!hasProject) return;

    for (const filePath of paths) {
      const ext = '.' + filePath.split('.').pop().toLowerCase();
      if (IMAGE_EXTENSIONS.includes(ext)) {
        await this.entityManager.addImageFromFile(filePath);
      }
    }

    this.updateCanvasTransform();
  }

  destroy() {
    this.viewport.removeEventListener('wheel', this.boundHandlers.handleWheel);
    this.viewport.removeEventListener('mousedown', this.boundHandlers.handleMouseDown);
    this.viewport.removeEventListener('dragover', this.boundHandlers.handleDragOver);
    this.viewport.removeEventListener('drop', this.boundHandlers.handleDrop);
    document.removeEventListener('mousemove', this.boundHandlers.handleMouseMove);
    document.removeEventListener('mouseup', this.boundHandlers.handleMouseUp);
    document.removeEventListener('keydown', this.boundHandlers.handleKeyDown);
    document.removeEventListener('keyup', this.boundHandlers.handleKeyUp);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('[App] DOMContentLoaded fired');
  
  window.api.onContextMenuAction((action) => {
    console.log('[IPC] Received context-menu action:', action);
    if (!window.app) {
      console.error('[IPC] App not initialized yet!');
      return;
    }
    if (action === 'add-images') {
      window.app.addImages();
    } else if (action === 'open-project') {
      window.app.openProject();
    } else if (action === 'reset-zoom') {
      window.app.resetZoom();
    }
  });

  window.api.onFilesDropped((paths) => {
    console.log('[IPC] Received files-dropped:', paths);
    if (!window.app) {
      console.error('[IPC] App not initialized yet!');
      return;
    }
    window.app.handleFilesFromIPC(paths);
  });
  
  window.app = new App();
  console.log('[App] App initialized');
});
