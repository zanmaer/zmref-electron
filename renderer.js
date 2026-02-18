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
      images: [],
      frames: []
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

  async openProjectByPath(projectPath) {
    console.log('[ProjectManager] openProjectByPath called with:', projectPath);
    if (!projectPath) return null;

    const configPath = await window.api.path.join(projectPath, 'config.json');
    console.log('[ProjectManager] configPath:', configPath);
    const exists = await window.api.fs.exists(configPath);
    console.log('[ProjectManager] config exists:', exists);
    if (!exists) return null;

    this.projectPath = projectPath;
    await this.ensureFilesDir();
    await this.loadConfig();
    console.log('[ProjectManager] Config loaded, returning:', this.projectPath);
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
          if (!this.config.frames) this.config.frames = [];
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
      images: [],
      frames: []
    };
  }

  setProjectPath(path) {
    this.projectPath = path;
  }

  setConfig(config) {
    this.config = config;
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

  addFrame(frameData) {
    this.config.frames.push(frameData);
    this.saveConfig();
  }

  updateFrame(id, data) {
    const frame = this.config.frames.find(f => f.id === id);
    if (frame) {
      Object.assign(frame, data);
      this.saveConfig();
    }
  }

  removeFrame(id) {
    this.config.frames = this.config.frames.filter(f => f.id !== id);
    this.saveConfig();
  }

  getFrames() {
    return this.config.frames || [];
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
    this.selectedEntities = new Set();
    this.dragState = {
      isDragging: false,
      entity: null,
      startX: 0,
      startY: 0,
      offsetX: 0,
      offsetY: 0,
      currentX: null,
      currentY: null,
      initialPositions: null
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
    img.decoding = 'async';

    const filesDir = await this.projectManager.getFilesDir();
    const fullPath = await window.api.path.join(filesDir, imageData.name);
    const fileURL = await window.api.path.toFileURL(fullPath);
    img.src = fileURL;

    img.style.left = `${imageData.x}px`;
    img.style.top = `${imageData.y}px`;
    img.style.transform = `scale(${imageData.scale})`;
    img.style.zIndex = 10;

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

    const onDragStart = (e) => {
      e.dataTransfer.setData('text/plain', imageData.id);
      e.dataTransfer.effectAllowed = 'move';
    };

    element.addEventListener('mousedown', onMouseDown);
    element.addEventListener('contextmenu', onContextMenu);
    element.addEventListener('dragstart', onDragStart);

    element._cleanup = () => {
      element.removeEventListener('mousedown', onMouseDown);
      element.removeEventListener('contextmenu', onContextMenu);
      element.removeEventListener('dragstart', onDragStart);
      delete element._cleanup;
    };
  }

  startDrag(e, element, imageData) {
    const isMultiSelect = this.selectedEntities.has(imageData.id);
    
    if (isMultiSelect) {
      this.dragState.isDragging = true;
      this.dragState.entity = element;
      this.dragState.imageData = imageData;
      this.dragState.startX = e.clientX;
      this.dragState.startY = e.clientY;
      this.dragState.currentX = null;
      this.dragState.currentY = null;
      
      this.dragState.initialPositions = {};
      this.selectedEntities.forEach(id => {
        const entity = this.entities.get(id);
        if (entity) {
          this.dragState.initialPositions[id] = { 
            x: entity.data.x, 
            y: entity.data.y 
          };
          entity.element.classList.add('dragging');
        }
      });
    } else {
      this.clearSelection();
      this.selectEntity(imageData.id);
      
      this.dragState.isDragging = true;
      this.dragState.entity = element;
      this.dragState.imageData = imageData;
      this.dragState.startX = e.clientX;
      this.dragState.startY = e.clientY;
      this.dragState.offsetX = imageData.x;
      this.dragState.offsetY = imageData.y;
      this.dragState.currentX = null;
      this.dragState.currentY = null;
      this.dragState.initialPositions = null;
      
      element.classList.add('dragging');
    }
  }

  handleDrag(e) {
    if (!this.dragState.isDragging || !this.dragState.entity) return;

    const dx = (e.clientX - this.dragState.startX) / this.camera.zoom;
    const dy = (e.clientY - this.dragState.startY) / this.camera.zoom;

    if (this.dragState.initialPositions) {
      Object.entries(this.dragState.initialPositions).forEach(([id, pos]) => {
        const entity = this.entities.get(id);
        if (entity) {
          const newX = pos.x + dx;
          const newY = pos.y + dy;
          entity.element.style.left = `${newX}px`;
          entity.element.style.top = `${newY}px`;
        }
      });
      this.dragState.currentX = dx;
      this.dragState.currentY = dy;
    } else {
      const newX = this.dragState.offsetX + dx;
      const newY = this.dragState.offsetY + dy;

      this.dragState.entity.style.left = `${newX}px`;
      this.dragState.entity.style.top = `${newY}px`;
      
      this.dragState.currentX = newX;
      this.dragState.currentY = newY;
    }
  }

  endDrag() {
    if (this.dragState.initialPositions) {
      Object.entries(this.dragState.initialPositions).forEach(([id, pos]) => {
        const entity = this.entities.get(id);
        if (entity) {
          const dx = this.dragState.currentX || 0;
          const dy = this.dragState.currentY || 0;
          const newX = pos.x + dx;
          const newY = pos.y + dy;
          
          entity.element.classList.remove('dragging');
          entity.data.x = newX;
          entity.data.y = newY;
          this.projectManager.updateImage(id, { x: newX, y: newY });
        }
      });
    } else if (this.dragState.entity && this.dragState.currentX !== null) {
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
    this.dragState.initialPositions = null;
  }

  deleteEntity(id) {
    const entity = this.entities.get(id);
    if (entity) {
      if (entity._cleanup) entity._cleanup();
      entity.element.remove();
      this.entities.delete(id);
      this.selectedEntities.delete(id);
      this.projectManager.removeImage(id);
    }
  }

  deleteSelected() {
    const idsToDelete = Array.from(this.selectedEntities);
    idsToDelete.forEach(id => this.deleteEntity(id));
  }

  async loadAllImages() {
    const config = this.projectManager.getConfig();
    const filesDir = await this.projectManager.getFilesDir();
    console.log('[EntityManager] loadAllImages - filesDir:', filesDir);
    
    const BATCH_SIZE = 10;
    const images = config.images;
    
    for (let i = 0; i < images.length; i += BATCH_SIZE) {
      const batch = images.slice(i, i + BATCH_SIZE);
      
      await Promise.all(
        batch.map(async (imageData) => {
          const fullPath = await window.api.path.join(filesDir, imageData.name);
          const exists = await window.api.fs.exists(fullPath);
          console.log('[EntityManager] Checking image:', fullPath, 'exists:', exists);
          
          if (exists) {
            await this.createEntity(imageData);
          } else {
            console.warn('[EntityManager] Image file not found, skipping:', imageData.name);
          }
        })
      );
      
      if (i + BATCH_SIZE < images.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
  }

  clearAll() {
    this.entities.forEach(({ element, element: { _cleanup } }) => {
      if (_cleanup) _cleanup();
      element.remove();
    });
    this.entities.clear();
    this.selectedEntities.clear();
  }

  selectEntity(id, addToSelection = false) {
    if (!addToSelection) {
      this.clearSelection();
    }
    
    const entity = this.entities.get(id);
    if (entity) {
      this.selectedEntities.add(id);
      entity.element.classList.add('selected');
    }
  }

  deselectEntity(id) {
    const entity = this.entities.get(id);
    if (entity) {
      this.selectedEntities.delete(id);
      entity.element.classList.remove('selected');
    }
  }

  clearSelection() {
    this.selectedEntities.forEach(id => {
      const entity = this.entities.get(id);
      if (entity) {
        entity.element.classList.remove('selected');
      }
    });
    this.selectedEntities.clear();
  }

  getSelectedEntities() {
    return Array.from(this.selectedEntities).map(id => this.entities.get(id)).filter(Boolean);
  }

  getSelectedIds() {
    return Array.from(this.selectedEntities);
  }

  selectAll() {
    this.entities.forEach((entity, id) => {
      this.selectedEntities.add(id);
      entity.element.classList.add('selected');
    });
  }

  hasSelection() {
    return this.selectedEntities.size > 0;
  }

  getEntity(id) {
    return this.entities.get(id);
  }

  attachImageToFrame(imageId, frameId, frameX, frameY) {
    const img = this.projectManager.config.images.find(i => i.id === imageId);
    if (img) {
      img.frameId = frameId;
      img.x = frameX;
      img.y = frameY;
      this.projectManager.saveConfig();
    }
  }

  detachImageFromFrame(imageId) {
    const img = this.projectManager.config.images.find(i => i.id === imageId);
    if (img && img.frameId) {
      const frame = this.projectManager.config.frames.find(f => f.id === img.frameId);
      if (frame) {
        img.x = frame.x + (img.x - frame.x);
        img.y = frame.y + (img.y - frame.y);
      }
      img.frameId = null;
      this.projectManager.saveConfig();
    }
  }

  getEntitiesInRect(rect) {
    const selected = [];
    this.entities.forEach((entity, id) => {
      const x = entity.data.x;
      const y = entity.data.y;
      const rectElem = entity.element.getBoundingClientRect();
      const w = rectElem.width / this.camera.zoom * entity.data.scale;
      const h = rectElem.height / this.camera.zoom * entity.data.scale;

      const intersects = !(rect.x > x + w || 
                          rect.x + rect.width < x || 
                          rect.y > y + h || 
                          rect.y + rect.height < y);

      if (intersects) {
        selected.push(id);
      }
    });
    return selected;
  }
}

const FRAME_MIN_SIZE = 100;
const FRAME_DEFAULT_SIZE = { width: 300, height: 200 };

class FrameManager {
  constructor(camera, projectManager, canvasEl) {
    this.camera = camera;
    this.projectManager = projectManager;
    this.canvas = canvasEl;
    this.frames = new Map();
    this.selectedFrame = null;

    this.resizeState = {
      isResizing: false,
      frame: null,
      handle: null,
      startX: 0,
      startY: 0,
      startWidth: 0,
      startHeight: 0,
      startFrameX: 0,
      startFrameY: 0
    };

    this.dragState = {
      isDragging: false,
      frame: null,
      startX: 0,
      startY: 0,
      startFrameX: 0,
      startFrameY: 0
    };
  }

  async createFrame(frameData) {
    const frameEl = document.createElement('div');
    frameEl.className = 'frame-container';
    frameEl.dataset.id = frameData.id;

    const contentEl = document.createElement('div');
    contentEl.className = 'frame-content';
    frameEl.appendChild(contentEl);

    const labelEl = document.createElement('div');
    labelEl.className = 'frame-label';
    labelEl.contentEditable = true;
    labelEl.spellcheck = false;
    labelEl.textContent = frameData.name || '';
    labelEl.dataset.frameId = frameData.id;
    frameEl.appendChild(labelEl);

    this.setupLabelEvents(labelEl, frameData);

    const handles = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
    for (const handle of handles) {
      const handleEl = document.createElement('div');
      handleEl.className = `frame-handle frame-handle-${handle}`;
      handleEl.dataset.handle = handle;
      frameEl.appendChild(handleEl);
    }

    frameEl.style.left = `${frameData.x}px`;
    frameEl.style.top = `${frameData.y}px`;
    frameEl.style.width = `${frameData.width}px`;
    frameEl.style.height = `${frameData.height}px`;
    frameEl.style.zIndex = frameData.zIndex || 0;

    this.setupFrameEvents(frameEl, frameData);

    this.canvas.appendChild(frameEl);
    this.frames.set(frameData.id, { element: frameEl, data: frameData });

    return frameEl;
  }

  setupLabelEvents(labelEl, frameData) {
    const onBlur = () => {
      const newName = labelEl.textContent.trim();
      if (newName !== frameData.name) {
        frameData.name = newName;
        this.projectManager.updateFrame(frameData.id, { name: newName });
      }
    };

    const onKeyDown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        labelEl.blur();
      }
      if (e.key === 'Escape') {
        labelEl.textContent = frameData.name;
        labelEl.blur();
      }
    };

    const onFocus = () => {
      const range = document.createRange();
      range.selectNodeContents(labelEl);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    };

    labelEl.addEventListener('blur', onBlur);
    labelEl.addEventListener('keydown', onKeyDown);
    labelEl.addEventListener('focus', onFocus);

    labelEl._cleanupLabel = () => {
      labelEl.removeEventListener('blur', onBlur);
      labelEl.removeEventListener('keydown', onKeyDown);
      labelEl.removeEventListener('focus', onFocus);
      delete labelEl._cleanupLabel;
    };
  }

  setupFrameEvents(frameEl, frameData) {
    const onMouseDown = (e) => {
      if (e.target.classList.contains('frame-label')) {
        return;
      }
      if (e.button === 0 && e.target.classList.contains('frame-handle')) {
        e.preventDefault();
        e.stopPropagation();
        this.startResize(e, frameEl, frameData, e.target.dataset.handle);
      } else if (e.button === 0 && !e.target.classList.contains('frame-handle')) {
        e.preventDefault();
        e.stopPropagation();
        this.selectFrame(frameEl, frameData);
        this.startDrag(e, frameEl, frameData);
      }
    };

    const onContextMenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.selectFrame(frameEl, frameData);
    };

    frameEl.addEventListener('mousedown', onMouseDown);
    frameEl.addEventListener('contextmenu', onContextMenu);

    frameEl._cleanup = () => {
      frameEl.removeEventListener('mousedown', onMouseDown);
      frameEl.removeEventListener('contextmenu', onContextMenu);
      delete frameEl._cleanup;
    };
  }

  selectFrame(frameEl, frameData) {
    if (this.selectedFrame) {
      this.selectedFrame.classList.remove('selected');
    }
    this.selectedFrame = frameEl;
    frameEl.classList.add('selected');
  }

  deselectFrame() {
    if (this.selectedFrame) {
      this.selectedFrame.classList.remove('selected');
      this.selectedFrame = null;
    }
  }

  startResize(e, frameEl, frameData, handle) {
    if (frameData.locked) return;
    
    this.resizeState.isResizing = true;
    this.resizeState.frame = frameEl;
    this.resizeState.handle = handle;
    this.resizeState.startX = e.clientX;
    this.resizeState.startY = e.clientY;
    this.resizeState.startWidth = frameData.width;
    this.resizeState.startHeight = frameData.height;
    this.resizeState.startFrameX = frameData.x;
    this.resizeState.startFrameY = frameData.y;

    frameEl.classList.add('resizing');
  }

  handleResize(e) {
    if (!this.resizeState.isResizing || !this.resizeState.frame) return;

    const dx = (e.clientX - this.resizeState.startX) / this.camera.zoom;
    const dy = (e.clientY - this.resizeState.startY) / this.camera.zoom;
    const handle = this.resizeState.handle;

    let newWidth = this.resizeState.startWidth;
    let newHeight = this.resizeState.startHeight;
    let newX = this.resizeState.startFrameX;
    let newY = this.resizeState.startFrameY;

    if (handle.includes('e')) {
      newWidth = Math.max(FRAME_MIN_SIZE, this.resizeState.startWidth + dx);
    }
    if (handle.includes('w')) {
      const widthChange = Math.min(dx, this.resizeState.startWidth - FRAME_MIN_SIZE);
      newWidth = this.resizeState.startWidth - widthChange;
      newX = this.resizeState.startFrameX + widthChange;
    }
    if (handle.includes('s')) {
      newHeight = Math.max(FRAME_MIN_SIZE, this.resizeState.startHeight + dy);
    }
    if (handle.includes('n')) {
      const heightChange = Math.min(dy, this.resizeState.startHeight - FRAME_MIN_SIZE);
      newHeight = this.resizeState.startHeight - heightChange;
      newY = this.resizeState.startFrameY + heightChange;
    }

    this.resizeState.frame.style.width = `${newWidth}px`;
    this.resizeState.frame.style.height = `${newHeight}px`;
    this.resizeState.frame.style.left = `${newX}px`;
    this.resizeState.frame.style.top = `${newY}px`;

    this.resizeState.currentWidth = newWidth;
    this.resizeState.currentHeight = newHeight;
    this.resizeState.currentX = newX;
    this.resizeState.currentY = newY;
  }

  endResize() {
    if (this.resizeState.isResizing && this.resizeState.currentWidth) {
      const frameId = this.resizeState.frame.dataset.id;
      this.projectManager.updateFrame(frameId, {
        x: this.resizeState.currentX,
        y: this.resizeState.currentY,
        width: this.resizeState.currentWidth,
        height: this.resizeState.currentHeight
      });
      this.resizeState.frame.classList.remove('resizing');
    }

    this.resizeState.isResizing = false;
    this.resizeState.frame = null;
    this.resizeState.handle = null;
    this.resizeState.currentWidth = null;
    this.resizeState.currentHeight = null;
  }

  startDrag(e, frameEl, frameData) {
    if (frameData.locked) return;
    
    this.dragState.isDragging = true;
    this.dragState.frame = frameEl;
    this.dragState.startX = e.clientX;
    this.dragState.startY = e.clientY;
    this.dragState.startFrameX = frameData.x;
    this.dragState.startFrameY = frameData.y;

    frameEl.classList.add('dragging');
  }

  handleDrag(e) {
    if (!this.dragState.isDragging || !this.dragState.frame) return;

    const dx = (e.clientX - this.dragState.startX) / this.camera.zoom;
    const dy = (e.clientY - this.dragState.startY) / this.camera.zoom;

    const newX = this.dragState.startFrameX + dx;
    const newY = this.dragState.startFrameY + dy;

    this.dragState.frame.style.left = `${newX}px`;
    this.dragState.frame.style.top = `${newY}px`;

    this.dragState.currentX = newX;
    this.dragState.currentY = newY;
  }

  endDrag() {
    if (this.dragState.isDragging && this.dragState.currentX !== null) {
      const frameId = this.dragState.frame.dataset.id;
      this.projectManager.updateFrame(frameId, {
        x: this.dragState.currentX,
        y: this.dragState.currentY
      });
      this.dragState.frame.classList.remove('dragging');
    }

    this.dragState.isDragging = false;
    this.dragState.frame = null;
    this.dragState.currentX = null;
    this.dragState.currentY = null;
  }

  async loadAllFrames() {
    const frames = this.projectManager.getFrames();
    for (const frameData of frames) {
      await this.createFrame(frameData);
    }
  }

  clearAll() {
    this.frames.forEach(({ element, element: { _cleanup } }) => {
      if (_cleanup) _cleanup();
      element.remove();
    });
    this.frames.clear();
    this.selectedFrame = null;
  }

  getFrame(id) {
    return this.frames.get(id);
  }

  deleteFrame(id) {
    const frame = this.frames.get(id);
    if (frame) {
      const frameData = frame.data;
      const config = this.projectManager.getConfig();

      config.images.forEach(img => {
        if (img.frameId === id) {
          img.frameId = null;
          this.projectManager.updateImage(img.id, { frameId: null });
        }
      });

      if (frame._cleanup) frame._cleanup();
      frame.element.remove();
      this.frames.delete(id);
      this.projectManager.removeFrame(id);

      if (this.selectedFrame === frame.element) {
        this.selectedFrame = null;
      }
    }
  }

  async addFrame() {
    const id = await window.api.crypto.randomUUID();
    const frameData = {
      id,
      name: `Frame ${this.frames.size + 1}`,
      x: 200,
      y: 200,
      width: FRAME_DEFAULT_SIZE.width,
      height: FRAME_DEFAULT_SIZE.height,
      zIndex: 0,
      locked: false,
      imageIds: []
    };

    this.projectManager.addFrame(frameData);
    await this.createFrame(frameData);
    this.selectFrame(this.frames.get(id).element, frameData);

    return frameData;
  }

  bringToFront(frameEl, frameData) {
    const maxZ = Math.max(10, ...this.frames.values().map(f => f.data.zIndex || 0));
    const newZ = Math.min(maxZ + 1, 10);
    frameEl.style.zIndex = newZ;
    this.projectManager.updateFrame(frameData.id, { zIndex: newZ });
  }

  clearFrame(id) {
    const config = this.projectManager.getConfig();
    config.images.forEach(img => {
      if (img.frameId === id) {
        img.frameId = null;
        this.projectManager.updateImage(img.id, { frameId: null });
      }
    });
  }
}

class App {
  constructor() {
    this.viewport = document.getElementById('viewport');
    this.canvas = document.getElementById('canvas');
    this.welcomeOverlay = document.getElementById('welcome-overlay');
    this.recentProjectsList = document.getElementById('recent-projects-list');
    this.statusZoom = document.getElementById('status-zoom');
    this.statusProject = document.getElementById('status-project');
    this.btnOpenProject = document.getElementById('btn-open-project');
    this.btnNewProject = document.getElementById('btn-new-project');
    this.dropStatus = document.getElementById('drop-status');

    this.camera = new Camera();
    this.projectManager = new ProjectManager();
    this.entityManager = new EntityManager(this.camera, this.projectManager, this.canvas);
    this.frameManager = new FrameManager(this.camera, this.projectManager, this.canvas);

    this.panState = {
      isPanning: false,
      startX: 0,
      startY: 0,
      startCx: 0,
      startCy: 0,
      spacePressed: false
    };

    this.selectionState = {
      isSelecting: false,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      rectElement: null
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
    this.loadRecentProjects();
    this.updateCanvasTransform();
  }

  async loadRecentProjects() {
    const projects = await window.api.recentProjects.validate();
    this.renderRecentProjects(projects);
  }

  renderRecentProjects(projects) {
    if (!this.recentProjectsList) return;
    
    this.recentProjectsList.innerHTML = '';
    
    const folderIcon = `<svg class="recent-project-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>`;
    
    projects.forEach(project => {
      const item = document.createElement('div');
      item.className = 'recent-project-item';
      
      const icon = document.createElement('div');
      icon.innerHTML = folderIcon;
      icon.className = 'recent-project-icon';
      
      const info = document.createElement('div');
      info.className = 'recent-project-info';
      
      const name = document.createElement('div');
      name.className = 'recent-project-name';
      name.textContent = project.path.split(/[/\\]/).pop();
      
      const pathEl = document.createElement('div');
      pathEl.className = 'recent-project-path';
      pathEl.textContent = project.path;
      
      const date = document.createElement('div');
      date.className = 'recent-project-date';
      date.textContent = this.formatDate(project.openedAt);
      
      info.appendChild(name);
      info.appendChild(pathEl);
      info.appendChild(date);
      
      item.appendChild(icon);
      item.appendChild(info);
      
      item.addEventListener('click', () => {
        this.openRecentProject(project.path);
      });
      
      this.recentProjectsList.appendChild(item);
    });
  }

  formatDate(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  async openRecentProject(path) {
    console.log('[App] openRecentProject called with:', path);
    const exists = await window.api.fs.exists(path);
    console.log('[App] Path exists:', exists);
    if (!exists) {
      console.log('[App] Path does not exist, removing from recent');
      await window.api.recentProjects.remove(path);
      await this.loadRecentProjects();
      return;
    }

    console.log('[App] Calling openProjectByPath...');
    const success = await this.projectManager.openProjectByPath(path);
    console.log('[App] openProjectByPath result:', success);
    if (!success) {
      console.log('[App] Failed to open project');
      return;
    }

    await window.api.recentProjects.add(path);
    await this.loadRecentProjects();

    this.welcomeOverlay.classList.remove('active');
    this.statusProject.textContent = path;

    const config = this.projectManager.getConfig();
    this.camera.setState(config.canvas);
    this.updateCanvasTransform();

    await this.entityManager.loadAllImages();
    await this.frameManager.loadAllFrames();
    this.repositionImagesInFrames();
  }

  setupEventListeners() {
    this.btnOpenProject.addEventListener('click', () => this.openProject());
    this.btnNewProject.addEventListener('click', () => this.createNewProject());

    this.viewport.addEventListener('wheel', this.boundHandlers.handleWheel, { passive: false });
    this.viewport.addEventListener('mousedown', this.boundHandlers.handleMouseDown);
    this.viewport.addEventListener('dragover', this.boundHandlers.handleDragOver);
    this.viewport.addEventListener('drop', this.boundHandlers.handleDrop);

    document.addEventListener('mousemove', this.boundHandlers.handleMouseMove);
    document.addEventListener('mouseup', this.boundHandlers.handleMouseUp);
    document.addEventListener('keydown', this.boundHandlers.handleKeyDown);
    document.addEventListener('keyup', this.boundHandlers.handleKeyUp);

    if (window.performance && window.performance.memory) {
      setInterval(() => {
        const mem = window.performance.memory;
        const usedMB = Math.round(mem.usedJSHeapSize / 1048576);
        const totalMB = Math.round(mem.jsHeapSizeLimit / 1048576);
        if (usedMB > totalMB * 0.8) {
          console.warn('[App] Memory warning: using', usedMB, 'MB of', totalMB, 'MB');
        }
      }, 10000);
    }
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
    await this.frameManager.loadAllFrames();
    this.repositionImagesInFrames();
    return true;
  }

  async openProject() {
    const path = await this.projectManager.openProject();
    if (!path) return;

    await window.api.recentProjects.add(path);
    await this.loadRecentProjects();

    this.welcomeOverlay.classList.remove('active');
    this.statusProject.textContent = path;

    const config = this.projectManager.getConfig();
    this.camera.setState(config.canvas);
    this.updateCanvasTransform();

    await this.entityManager.loadAllImages();
    await this.frameManager.loadAllFrames();
    this.repositionImagesInFrames();
  }

  async createNewProject() {
    const path = await window.api.dialog.openDirectory();
    if (!path) return;

    const filesDir = await window.api.path.join(path, 'files');
    await window.api.fs.mkdir(filesDir);

    const config = {
      canvas: { cx: 0, cy: 0, zoom: 1 },
      images: [],
      frames: []
    };
    
    const configPath = await window.api.path.join(path, 'config.json');
    await window.api.fs.writeFile(configPath, JSON.stringify(config, null, 2));

    await window.api.recentProjects.add(path);
    await this.loadRecentProjects();

    this.welcomeOverlay.classList.remove('active');
    this.statusProject.textContent = path;

    this.projectManager.setProjectPath(path);
    this.projectManager.setConfig(config);
    this.camera.setState(config.canvas);
    this.updateCanvasTransform();
  }

  repositionImagesInFrames() {
    const config = this.projectManager.getConfig();
    config.images.forEach(img => {
      if (img.frameId) {
        const entity = this.entityManager.getEntity(img.id);
        if (entity) {
          const frame = this.frameManager.getFrame(img.frameId);
          if (frame) {
            const frameEl = frame.element;
            const contentEl = frameEl.querySelector('.frame-content');
            contentEl.appendChild(entity.element);
            entity.element.style.left = `${img.x - frame.data.x}px`;
            entity.element.style.top = `${img.y - frame.data.y}px`;
          }
        }
      }
    });
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
    } else if (e.button === 0) {
      const targetIsEntity = e.target.classList.contains('canvas-image');
      const targetIsFrame = e.target.closest('.frame-container');
      const targetIsCanvas = e.target === this.canvas || 
                             e.target === this.viewport ||
                             this.canvas.contains(e.target);
      
      if (targetIsCanvas && !targetIsEntity && !targetIsFrame) {
        this.entityManager.clearSelection();
        this.entityManager.endDrag();
        this.frameManager.deselectFrame();
        this.startSelection(e);
      }
    }
  }

  startSelection(e) {
    const rect = this.viewport.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    this.selectionState.isSelecting = true;
    this.selectionState.startX = x;
    this.selectionState.startY = y;
    this.selectionState.currentX = x;
    this.selectionState.currentY = y;

    if (!this.selectionState.rectElement) {
      this.selectionState.rectElement = document.createElement('div');
      this.selectionState.rectElement.className = 'selection-rect';
      this.canvas.appendChild(this.selectionState.rectElement);
    }

    this.selectionState.rectElement.style.left = `${x}px`;
    this.selectionState.rectElement.style.top = `${y}px`;
    this.selectionState.rectElement.style.width = '0px';
    this.selectionState.rectElement.style.height = '0px';
    this.selectionState.rectElement.style.display = 'block';
  }

  updateSelection(e) {
    if (!this.selectionState.isSelecting) return;

    const viewportRect = this.viewport.getBoundingClientRect();
    const x = e.clientX - viewportRect.left;
    const y = e.clientY - viewportRect.top;

    this.selectionState.currentX = x;
    this.selectionState.currentY = y;

    const canvasX = (x - this.camera.cx) / this.camera.zoom;
    const canvasY = (y - this.camera.cy) / this.camera.zoom;
    const startCanvasX = (this.selectionState.startX - this.camera.cx) / this.camera.zoom;
    const startCanvasY = (this.selectionState.startY - this.camera.cy) / this.camera.zoom;

    const left = Math.min(startCanvasX, canvasX);
    const top = Math.min(startCanvasY, canvasY);
    const width = Math.abs(canvasX - startCanvasX);
    const height = Math.abs(canvasY - startCanvasY);

    this.selectionState.rectElement.style.left = `${left}px`;
    this.selectionState.rectElement.style.top = `${top}px`;
    this.selectionState.rectElement.style.width = `${width}px`;
    this.selectionState.rectElement.style.height = `${height}px`;
  }

  endSelection() {
    if (!this.selectionState.isSelecting) return;

    this.selectionState.isSelecting = false;

    if (this.selectionState.rectElement) {
      this.selectionState.rectElement.style.display = 'none';
    }

    const left = Math.min(this.selectionState.startX, this.selectionState.currentX);
    const top = Math.min(this.selectionState.startY, this.selectionState.currentY);
    const width = Math.abs(this.selectionState.currentX - this.selectionState.startX);
    const height = Math.abs(this.selectionState.currentY - this.selectionState.startY);

    if (width > 5 || height > 5) {
      const viewportRect = this.viewport.getBoundingClientRect();
      const selRect = {
        x: (left - viewportRect.left - this.camera.cx) / this.camera.zoom,
        y: (top - viewportRect.top - this.camera.cy) / this.camera.zoom,
        width: width / this.camera.zoom,
        height: height / this.camera.zoom
      };

      const selectedIds = this.entityManager.getEntitiesInRect(selRect);
      
      if (selectedIds.length > 0) {
        this.entityManager.clearSelection();
        selectedIds.forEach(id => this.entityManager.selectEntity(id, true));
      }
    }
  }

  updateSelectionBounds() {
    // Bounding box removed - selection is now per-object only
    // Each selected image has its own .selected class with outline
  }

  handleMouseMove(e) {
    if (this.panState.isPanning) {
      this.updatePan(e);
    } else if (this.selectionState.isSelecting) {
      this.updateSelection(e);
    } else if (this.frameManager.resizeState.isResizing) {
      this.frameManager.handleResize(e);
    } else if (this.frameManager.dragState.isDragging) {
      this.frameManager.handleDrag(e);
    } else if (this.entityManager.dragState.isDragging) {
      this.entityManager.handleDrag(e);
    }
  }

  handleMouseUp() {
    if (this.panState.isPanning) {
      this.endPan();
    }
    if (this.selectionState.isSelecting) {
      this.endSelection();
    }
    if (this.frameManager.resizeState.isResizing) {
      this.frameManager.endResize();
    }
    if (this.frameManager.dragState.isDragging) {
      this.frameManager.endDrag();
    }
    this.entityManager.endDrag();
  }

  handleKeyDown(e) {
    if (e.code === 'Space' && !this.panState.spacePressed) {
      this.panState.spacePressed = true;
      this.viewport.classList.add('pan-mode');
    } else if (e.code === 'Escape') {
      this.entityManager.clearSelection();
      this.frameManager.deselectFrame();
    } else if (e.code === 'Delete' || e.code === 'Backspace') {
      if (this.entityManager.hasSelection()) {
        this.entityManager.deleteSelected();
      } else {
        const draggingEntity = this.entityManager.dragState.entity;
        if (draggingEntity) {
          const id = draggingEntity.dataset.id;
          this.entityManager.deleteEntity(id);
        } else if (this.frameManager.selectedFrame) {
          const id = this.frameManager.selectedFrame.dataset.id;
          this.frameManager.deleteFrame(id);
        }
      }
    } else if (e.code === 'KeyA' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.entityManager.selectAll();
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

    const frameEl = e.target.closest('.frame-container');
    if (frameEl) {
      frameEl.classList.add('drag-over');
    }

    document.querySelectorAll('.frame-container').forEach(el => {
      if (el !== frameEl) {
        el.classList.remove('drag-over');
      }
    });
  }

  async handleDrop(e) {
    e.preventDefault();

    document.querySelectorAll('.frame-container').forEach(el => {
      el.classList.remove('drag-over');
    });

    const frameEl = e.target.closest('.frame-container');
    const files = Array.from(e.dataTransfer.files);
    
    const hasProject = await this.ensureProjectOpen();
    if (!hasProject) return;

    if (files.length > 0) {
      for (const file of files) {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (IMAGE_EXTENSIONS.includes(ext)) {
          const imageData = await this.entityManager.addImageFromFile(file.path);
          if (frameEl && imageData) {
            const frameId = frameEl.dataset.id;
            const frame = this.frameManager.getFrame(frameId);
            if (frame) {
              const rect = frameEl.getBoundingClientRect();
              const dropX = (e.clientX - rect.left) / this.camera.zoom;
              const dropY = (e.clientY - rect.top) / this.camera.zoom;

              this.attachImageToFrame(imageData.id, frameId, frame.data.x + dropX, frame.data.y + dropY, frameEl);
            }
          }
        }
      }
    } else if (frameEl) {
      const imageId = e.dataTransfer.getData('text/plain');
      if (imageId) {
        const frameId = frameEl.dataset.id;
        const frame = this.frameManager.getFrame(frameId);
        if (frame) {
          const rect = frameEl.getBoundingClientRect();
          const dropX = (e.clientX - rect.left) / this.camera.zoom;
          const dropY = (e.clientY - rect.top) / this.camera.zoom;

          this.attachImageToFrame(imageId, frameId, frame.data.x + dropX, frame.data.y + dropY, frameEl);
        }
      }
    }

    this.updateCanvasTransform();
  }

  async attachImageToFrame(imageId, frameId, canvasX, canvasY, frameEl) {
    const entity = this.entityManager.getEntity(imageId);
    if (!entity) return;

    const frame = this.frameManager.getFrame(frameId);
    if (!frame) return;

    const contentEl = frameEl.querySelector('.frame-content');
    contentEl.appendChild(entity.element);

    entity.element.style.left = `${canvasX - frame.data.x}px`;
    entity.element.style.top = `${canvasY - frame.data.y}px`;

    this.entityManager.attachImageToFrame(imageId, frameId, canvasX, canvasY);
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

  async createFrame() {
    const hasProject = await this.ensureProjectOpen();
    if (!hasProject) return;
    await this.frameManager.addFrame();
  }

  deleteSelectedFrame() {
    if (this.frameManager.selectedFrame) {
      const id = this.frameManager.selectedFrame.dataset.id;
      this.frameManager.deleteFrame(id);
    }
  }

  clearSelectedFrame() {
    if (this.frameManager.selectedFrame) {
      const id = this.frameManager.selectedFrame.dataset.id;
      this.frameManager.clearFrame(id);
      const frame = this.frameManager.getFrame(id);
      if (frame) {
        const config = this.projectManager.getConfig();
        config.images.forEach(img => {
          if (img.frameId === id) {
            const entity = this.entityManager.getEntity(img.id);
            if (entity) {
              this.canvas.appendChild(entity.element);
              entity.element.style.left = `${img.x}px`;
              entity.element.style.top = `${img.y}px`;
            }
          }
        });
      }
    }
  }

  bringSelectedFrameToFront() {
    if (this.frameManager.selectedFrame) {
      const id = this.frameManager.selectedFrame.dataset.id;
      const frame = this.frameManager.getFrame(id);
      if (frame) {
        this.frameManager.bringToFront(this.frameManager.selectedFrame, frame.data);
      }
    }
  }

  toggleFrameLock() {
    if (this.frameManager.selectedFrame) {
      const id = this.frameManager.selectedFrame.dataset.id;
      const frame = this.frameManager.getFrame(id);
      if (frame) {
        frame.data.locked = !frame.data.locked;
        this.frameManager.selectedFrame.classList.toggle('locked', frame.data.locked);
        this.projectManager.updateFrame(id, { locked: frame.data.locked });
      }
    }
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
    } else if (action === 'create-frame') {
      window.app.createFrame();
    } else if (action === 'delete-frame') {
      window.app.deleteSelectedFrame();
    } else if (action === 'clear-frame') {
      window.app.clearSelectedFrame();
    } else if (action === 'bring-to-front') {
      window.app.bringSelectedFrameToFront();
    } else if (action === 'lock-frame') {
      window.app.toggleFrameLock();
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
