const CONSTANTS = Object.freeze({
  DEBOUNCE_DELAY_MS: 500,
  WHEEL_THROTTLE_MS: 16,
  IMAGE_EXTENSIONS: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'],
  DEFAULT_IMAGE_POSITION: { x: 100, y: 100 },
  POSITION_RANDOM_RANGE: 200,
  FRAME_MIN_SIZE: 2000,
  FRAME_DEFAULT_SIZE: { width: 2000, height: 2000 },
  DISTRIBUTE_GAP: 50,
  DISTRIBUTE_GRID_COLS: 4,
  IMAGE_LOAD_BATCH_SIZE: 10,
  IMAGE_LOAD_BATCH_DELAY_MS: 50,
  SELECTION_MIN_SIZE: 5,
  RECENT_PROJECTS_MAX: 5,
  ZOOM_FACTOR_IN: 0.9,
  ZOOM_FACTOR_OUT: 1.1,
  MIN_ZOOM: 0.05,
  MAX_ZOOM: 5,
  DEFAULT_ZOOM: 1,
  MEMORY_WARNING_THRESHOLD: 0.7,
  MEMORY_CHECK_INTERVAL_MS: 10000,
  THUMBNAIL: Object.freeze({
    MAX_SIZE: 800,
    DIR_NAME: 'thumbs',
    FORMAT: 'jpeg',
    QUALITY: 85
  })
});

class Camera {
  constructor() {
    this.cx = 0;
    this.cy = 0;
    this.zoom = CONSTANTS.DEFAULT_ZOOM;
    this.minZoom = CONSTANTS.MIN_ZOOM;
    this.maxZoom = CONSTANTS.MAX_ZOOM;
  }

  applyToElement(element) {
    element.style.transform = `translate(${Math.round(this.cx)}px, ${Math.round(this.cy)}px) scale(${this.zoom})`;
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

    const zoomFactor = delta > 0 ? CONSTANTS.ZOOM_FACTOR_IN : CONSTANTS.ZOOM_FACTOR_OUT;
    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * zoomFactor));

    if (newZoom === this.zoom) return;

    const worldX = (mouseX - this.cx) / this.zoom;
    const worldY = (mouseY - this.cy) / this.zoom;

    this.zoom = newZoom;
    this.cx = Math.round(mouseX - worldX * this.zoom);
    this.cy = Math.round(mouseY - worldY * this.zoom);
  }

  reset() {
    this.cx = 0;
    this.cy = 0;
    this.zoom = CONSTANTS.DEFAULT_ZOOM;
  }

  getState() {
    return { cx: this.cx, cy: this.cy, zoom: this.zoom };
  }

  setState(state) {
    if (state) {
      this.cx = state.cx || 0;
      this.cy = state.cy || 0;
      this.zoom = state.zoom || CONSTANTS.DEFAULT_ZOOM;
    }
  }
}

class ProjectManager {
  constructor() {
    this.projectPath = null;
    this.config = this._createDefaultConfig();
    this.saveTimeout = null;
  }

  _createDefaultConfig() {
    return {
      canvas: { cx: 0, cy: 0, zoom: CONSTANTS.DEFAULT_ZOOM },
      images: [],
      frames: []
    };
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
    if (!projectPath) return null;

    const configPath = await window.api.path.join(projectPath, 'config.json');
    const exists = await window.api.fs.exists(configPath);
    if (!exists) return null;

    this.projectPath = projectPath;
    await this.ensureFilesDir();
    await this.loadConfig();
    return this.projectPath;
  }

  async ensureFilesDir() {
    const filesDir = await window.api.fs.getFilesDir(this.projectPath);
    const filesResult = await window.api.fs.mkdir(filesDir);
    if (!filesResult.success) {
      console.error('[ProjectManager] Failed to create files directory:', filesResult.error);
      return false;
    }

    const thumbsResult = await window.api.thumbnail.ensureThumbsDir(this.projectPath);
    if (!thumbsResult.success) {
      console.error('[ProjectManager] Failed to create thumbs directory:', thumbsResult.error);
      return false;
    }

    return await window.api.fs.exists(filesDir);
  }

  async getThumbsDir() {
    if (!this.projectPath) {
      console.error('[ProjectManager] projectPath is not set');
      return '';
    }
    return await window.api.path.join(this.projectPath, CONSTANTS.THUMBNAIL.DIR_NAME);
  }

  async loadConfig() {
    const configPath = await window.api.fs.getConfigPath(this.projectPath);
    const exists = await window.api.fs.exists(configPath);

    if (exists) {
      const result = await window.api.fs.readFile(configPath);
      if (result.success) {
        try {
          this.config = JSON.parse(result.data);
          if (!this.config.canvas) this.config.canvas = { cx: 0, cy: 0, zoom: CONSTANTS.DEFAULT_ZOOM };
          if (!this.config.images) this.config.images = [];
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
    this.config = this._createDefaultConfig();
  }

  setProjectPath(path) {
    this.projectPath = path;
  }

  setConfig(config) {
    this.config = config;
  }

  async saveConfig() {
    if (!this.projectPath) return;

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

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
    }, CONSTANTS.DEBOUNCE_DELAY_MS);
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

  getImages() {
    return this.config.images || [];
  }

  getFrames() {
    return this.config.frames || [];
  }

  getImageById(id) {
    return this.config.images.find(i => i.id === id);
  }

  getFrameById(id) {
    return this.config.frames.find(f => f.id === id);
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
    const img = this.getImageById(id);
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
    const frame = this.getFrameById(id);
    if (frame) {
      Object.assign(frame, data);
      this.saveConfig();
    }
  }

  removeFrame(id) {
    this.config.frames = this.config.frames.filter(f => f.id !== id);
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
    this.selectedEntities = new Set();
    this.dragState = this._createDragState();
    this._dimensionCache = new Map();
  }

  _createDragState() {
    return {
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

  _getEntityDimensions(entity) {
    const data = entity.data || entity;
    const element = entity.element || entity;

    if (this._dimensionCache.has(data.id)) {
      return this._dimensionCache.get(data.id);
    }

    const naturalWidth = element.naturalWidth || element.offsetWidth;
    const naturalHeight = element.naturalHeight || element.offsetHeight;
    const dims = {
      width: naturalWidth * (data.scale || 1),
      height: naturalHeight * (data.scale || 1)
    };

    this._dimensionCache.set(data.id, dims);
    return dims;
  }

  _invalidateDimensionCache(id) {
    this._dimensionCache.delete(id);
  }

  async addImageFromFile(filePath) {
    const id = await window.api.crypto.randomUUID();
    const ext = await window.api.path.extname(filePath);
    const filesDir = await this.projectManager.getFilesDir();
    const thumbsDir = await this.projectManager.getThumbsDir();

    const uniqueName = `${id}${ext}`;
    const destPath = await window.api.path.join(filesDir, uniqueName);

    const copyResult = await window.api.fs.copyFile(filePath, destPath);
    if (!copyResult.success) {
      console.error('[EntityManager] Failed to copy file:', copyResult.error);
      return null;
    }

    const thumbResult = await window.api.thumbnail.ensure(destPath, thumbsDir, id);
    if (!thumbResult.success) {
      console.error('[EntityManager] Failed to generate thumbnail:', thumbResult.error);
    }

    const thumbName = thumbResult.success ? `${id}.jpg` : null;

    const imageData = {
      id,
      name: uniqueName,
      thumbName: thumbName,
      x: Math.round(CONSTANTS.DEFAULT_IMAGE_POSITION.x + Math.random() * CONSTANTS.POSITION_RANDOM_RANGE),
      y: Math.round(CONSTANTS.DEFAULT_IMAGE_POSITION.y + Math.random() * CONSTANTS.POSITION_RANDOM_RANGE),
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

    let fileURL;
    if (imageData.thumbName) {
      const thumbsDir = await this.projectManager.getThumbsDir();
      const thumbPath = await window.api.path.join(thumbsDir, imageData.thumbName);
      fileURL = await window.api.path.toFileURL(thumbPath);
    } else {
      const filesDir = await this.projectManager.getFilesDir();
      const fullPath = await window.api.path.join(filesDir, imageData.name);
      fileURL = await window.api.path.toFileURL(fullPath);
    }
    img.src = fileURL;

    img.style.transform = `translate(${Math.round(imageData.x)}px, ${Math.round(imageData.y)}px) scale(${imageData.scale})`;
    img.style.zIndex = 10;

    this._setupEntityEvents(img, imageData);

    img.onload = () => {
      this._invalidateDimensionCache(imageData.id);
    };

    img.onerror = () => {
      console.error('[EntityManager] Failed to load image:', imageData.name);
      img.classList.add('load-error');
    };

    this.canvas.appendChild(img);
    this.entities.set(imageData.id, { element: img, data: imageData });

    return img;
  }

  _setupEntityEvents(element, imageData) {
    const onMouseDown = (e) => {
      if (e.button === 0) {
        e.preventDefault();
        e.stopPropagation();
        this._startDrag(e, element, imageData);
      }
    };

    const onContextMenu = (e) => {
      e.stopPropagation();
    };

    element.addEventListener('mousedown', onMouseDown);
    element.addEventListener('contextmenu', onContextMenu);
  }

  _startDrag(e, element, imageData) {
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
          entity.element.classList.add('dragging', 'is-dragging');
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

      element.classList.add('dragging', 'is-dragging');
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
          const newX = Math.round(pos.x + dx);
          const newY = Math.round(pos.y + dy);
          const scale = entity.data.scale || 1;
          entity.element.style.transform = `translate(${newX}px, ${newY}px) scale(${scale})`;
        }
      });
      this.dragState.currentX = dx;
      this.dragState.currentY = dy;
    } else {
      const newX = Math.round(this.dragState.offsetX + dx);
      const newY = Math.round(this.dragState.offsetY + dy);
      const scale = this.dragState.imageData.scale || 1;

      this.dragState.entity.style.transform = `translate(${newX}px, ${newY}px) scale(${scale})`;

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
          const newX = Math.round(pos.x + dx);
          const newY = Math.round(pos.y + dy);

          entity.element.classList.remove('dragging', 'is-dragging');
          entity.data.x = newX;
          entity.data.y = newY;
          this.projectManager.updateImage(id, { x: newX, y: newY });
        }
      });
    } else if (this.dragState.entity && this.dragState.currentX !== null) {
      const id = this.dragState.entity.dataset.id;
      this.projectManager.updateImage(id, {
        x: Math.round(this.dragState.currentX),
        y: Math.round(this.dragState.currentY)
      });
      this.dragState.entity.classList.remove('dragging', 'is-dragging');
    }
    this.dragState = this._createDragState();
  }

  async deleteEntity(id) {
    const entity = this.entities.get(id);
    if (entity) {
      const imageName = entity.data.name;
      if (imageName) {
        try {
          const filesDir = await this.projectManager.getFilesDir();
          const filePath = await window.api.path.join(filesDir, imageName);
          const exists = await window.api.fs.exists(filePath);
          if (exists) {
            await window.api.fs.deleteFile(filePath);
          }
        } catch (error) {
          console.error('[EntityManager] Failed to delete image file:', error);
        }
      }

      const thumbName = entity.data.thumbName;
      if (thumbName) {
        try {
          const thumbsDir = await this.projectManager.getThumbsDir();
          const thumbPath = await window.api.path.join(thumbsDir, thumbName);
          await window.api.thumbnail.delete(thumbPath);
        } catch (error) {
          console.error('[EntityManager] Failed to delete thumbnail:', error);
        }
      }

      entity.element.remove();
      this.entities.delete(id);
      this.selectedEntities.delete(id);
      this._dimensionCache.delete(id);
      this.projectManager.removeImage(id);
    }
  }

  async deleteSelected() {
    const idsToDelete = Array.from(this.selectedEntities);
    for (const id of idsToDelete) {
      await this.deleteEntity(id);
    }
  }

  async loadAllImages() {
    const config = this.projectManager.getConfig();
    const filesDir = await this.projectManager.getFilesDir();

    const images = config.images;
    const batchSize = CONSTANTS.IMAGE_LOAD_BATCH_SIZE;

    for (let i = 0; i < images.length; i += batchSize) {
      const batch = images.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (imageData) => {
          const fullPath = await window.api.path.join(filesDir, imageData.name);
          const exists = await window.api.fs.exists(fullPath);

          if (exists) {
            await this.createEntity(imageData);
          } else {
            console.warn('[EntityManager] Image file not found, skipping:', imageData.name);
          }
        })
      );

      if (i + batchSize < images.length) {
        await new Promise(resolve => setTimeout(resolve, CONSTANTS.IMAGE_LOAD_BATCH_DELAY_MS));
      }
    }
  }

  clearAll() {
    this.entities.forEach(({ element }) => {
      element.src = '';
      element.onload = null;
      element.onerror = null;
      element.remove();
    });
    this.entities.clear();
    this.selectedEntities.clear();
    this._dimensionCache.clear();

    if (window.gc) {
      window.gc();
    }
  }

  unloadOffscreenImages(viewport) {
    if (!viewport) return 0;

    let freed = 0;
    const vpLeft = viewport.left;
    const vpTop = viewport.top;
    const vpRight = viewport.right;
    const vpBottom = viewport.bottom;

    this.entities.forEach(({ element, data }, id) => {
      const dims = this._getEntityDimensions({ element, data });
      const isVisible = !(data.x + dims.width < vpLeft ||
                          data.x > vpRight ||
                          data.y + dims.height < vpTop ||
                          data.y > vpBottom);

      if (!isVisible && element.src && element.dataset.isUnloaded !== 'true') {
        element.src = '';
        element.dataset.isUnloaded = 'true';
        freed++;
      }
    });

    return freed;
  }

  async reloadImage(id) {
    const entity = this.entities.get(id);
    if (entity && entity.element.dataset.isUnloaded === 'true') {
      const filesDir = await this.projectManager.getFilesDir();
      const fullPath = await window.api.path.join(filesDir, entity.data.name);
      const fileURL = await window.api.path.toFileURL(fullPath);
      entity.element.src = fileURL;
      delete entity.element.dataset.isUnloaded;
      this._invalidateDimensionCache(id);
    }
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
    const img = this.projectManager.getImageById(imageId);
    if (img) {
      img.frameId = frameId;
      img.x = frameX;
      img.y = frameY;
      this.projectManager.saveConfig();
    }
  }

  detachImageFromFrame(imageId) {
    const img = this.projectManager.getImageById(imageId);
    const entity = this.entities.get(imageId);
    if (img && img.frameId && entity) {
      const frame = this.projectManager.getFrameById(img.frameId);
      if (frame) {
        img.x = frame.x + entity.data.x;
        img.y = frame.y + entity.data.y;

        this.canvas.appendChild(entity.element);
        const scale = entity.data.scale || 1;
        entity.element.style.transform = `translate(${Math.round(img.x)}px, ${Math.round(img.y)}px) scale(${scale})`;
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
      const dims = this._getEntityDimensions(entity);

      const intersects = !(rect.x > x + dims.width ||
                          rect.x + rect.width < x ||
                          rect.y > y + dims.height ||
                          rect.y + rect.height < y);

      if (intersects) {
        selected.push(id);
      }
    });
    return selected;
  }

  getSelectionBounds() {
    if (this.selectedEntities.size === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    this.selectedEntities.forEach(id => {
      const entity = this.entities.get(id);
      if (entity) {
        const x = entity.data.x;
        const y = entity.data.y;
        const dims = this._getEntityDimensions(entity);

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + dims.width);
        maxY = Math.max(maxY, y + dims.height);
      }
    });

    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }
}

class FrameManager {
  constructor(camera, projectManager, canvasEl) {
    this.camera = camera;
    this.projectManager = projectManager;
    this.canvas = canvasEl;
    this.frames = new Map();
    this.selectedFrame = null;
    this.resizeState = this._createResizeState();
    this.dragState = this._createDragState();
  }

  _createResizeState() {
    return {
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
  }

  _createDragState() {
    return {
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

    this._setupLabelEvents(labelEl, frameData);

    const handles = ['se'];
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

    this._setupFrameEvents(frameEl, frameData);

    this.canvas.appendChild(frameEl);
    this.frames.set(frameData.id, { element: frameEl, data: frameData });

    return frameEl;
  }

  _setupLabelEvents(labelEl, frameData) {
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
  }

  _setupFrameEvents(frameEl, frameData) {
    const onMouseDown = (e) => {
      if (e.target.classList.contains('frame-label')) {
        return;
      }
      if (e.button === 0 && e.target.classList.contains('frame-handle')) {
        e.preventDefault();
        e.stopPropagation();
        this._startResize(e, frameEl, frameData, e.target.dataset.handle);
      } else if (e.button === 0 && !e.target.classList.contains('frame-handle')) {
        e.preventDefault();
        e.stopPropagation();
        this.selectFrame(frameEl, frameData);
        this._startDrag(e, frameEl, frameData);
      }
    };

    const onContextMenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.selectFrame(frameEl, frameData);
    };

    frameEl.addEventListener('mousedown', onMouseDown);
    frameEl.addEventListener('contextmenu', onContextMenu);
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

  _startResize(e, frameEl, frameData, handle) {
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
      newWidth = Math.max(CONSTANTS.FRAME_MIN_SIZE, this.resizeState.startWidth + dx);
    }
    if (handle.includes('w')) {
      const widthChange = Math.min(dx, this.resizeState.startWidth - CONSTANTS.FRAME_MIN_SIZE);
      newWidth = this.resizeState.startWidth - widthChange;
      newX = this.resizeState.startFrameX + widthChange;
    }
    if (handle.includes('s')) {
      newHeight = Math.max(CONSTANTS.FRAME_MIN_SIZE, this.resizeState.startHeight + dy);
    }
    if (handle.includes('n')) {
      const heightChange = Math.min(dy, this.resizeState.startHeight - CONSTANTS.FRAME_MIN_SIZE);
      newHeight = this.resizeState.startHeight - heightChange;
      newY = this.resizeState.startFrameY + heightChange;
    }

    this.resizeState.frame.style.width = `${Math.round(newWidth)}px`;
    this.resizeState.frame.style.height = `${Math.round(newHeight)}px`;
    this.resizeState.frame.style.left = `${Math.round(newX)}px`;
    this.resizeState.frame.style.top = `${Math.round(newY)}px`;

    this.resizeState.currentWidth = Math.round(newWidth);
    this.resizeState.currentHeight = Math.round(newHeight);
    this.resizeState.currentX = Math.round(newX);
    this.resizeState.currentY = Math.round(newY);
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

    this.resizeState = this._createResizeState();
  }

  _startDrag(e, frameEl, frameData) {
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

    const newX = Math.round(this.dragState.startFrameX + dx);
    const newY = Math.round(this.dragState.startFrameY + dy);

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

    this.dragState = this._createDragState();
  }

  async loadAllFrames() {
    const frames = this.projectManager.getFrames();
    const batchSize = CONSTANTS.IMAGE_LOAD_BATCH_SIZE;

    for (let i = 0; i < frames.length; i += batchSize) {
      const batch = frames.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (frameData) => {
          await this.createFrame(frameData);
        })
      );

      if (i + batchSize < frames.length) {
        await new Promise(resolve => setTimeout(resolve, CONSTANTS.IMAGE_LOAD_BATCH_DELAY_MS));
      }
    }
  }

  clearAll() {
    this.frames.forEach(({ element }) => {
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
      const config = this.projectManager.getConfig();

      config.images.forEach(img => {
        if (img.frameId === id) {
          const entity = this.entityManager.getEntity(img.id);
          if (entity) {
            this.canvas.appendChild(entity.element);
            const scale = entity.data.scale || 1;
            entity.element.style.transform = `translate(${Math.round(img.x)}px, ${Math.round(img.y)}px) scale(${scale})`;
          }
          img.frameId = null;
          this.projectManager.updateImage(img.id, { frameId: null });
        }
      });

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
      width: CONSTANTS.FRAME_DEFAULT_SIZE.width,
      height: CONSTANTS.FRAME_DEFAULT_SIZE.height,
      zIndex: 1,
      locked: false,
      imageIds: []
    };

    this.projectManager.addFrame(frameData);
    await this.createFrame(frameData);
    this.selectFrame(this.frames.get(id).element, frameData);

    return frameData;
  }

  bringToFront(frameEl, frameData) {
    const maxZ = Math.max(1, ...this.frames.values().map(f => f.data.zIndex || 0));
    const newZ = maxZ + 1;
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
    this.memoryCheckInterval = null;
    this.boundHandlers = this._createBoundHandlers();

    this._setupEventListeners();
    this._startMemoryMonitoring();
    this._loadRecentProjects();
    this._updateCanvasTransform();
  }

  _createBoundHandlers() {
    return {
      handleWheel: this._handleWheel.bind(this),
      handleMouseDown: this._handleMouseDown.bind(this),
      handleMouseMove: this._handleMouseMove.bind(this),
      handleMouseUp: this._handleMouseUp.bind(this),
      handleKeyDown: this._handleKeyDown.bind(this),
      handleKeyUp: this._handleKeyUp.bind(this),
      handleDragOver: this._handleDragOver.bind(this),
      handleDrop: this._handleDrop.bind(this)
    };
  }

  _startMemoryMonitoring() {
    if (window.performance && window.performance.memory) {
      this.memoryCheckInterval = setInterval(() => {
        const mem = window.performance.memory;
        const usedMB = Math.round(mem.usedJSHeapSize / 1048576);
        const totalMB = Math.round(mem.jsHeapSizeLimit / 1048576);
        const usagePercent = (mem.usedJSHeapSize / mem.jsHeapSizeLimit);

        if (usagePercent > CONSTANTS.MEMORY_WARNING_THRESHOLD) {
          console.warn('[App] Memory warning:', (usagePercent * 100).toFixed(1) + '% (', usedMB, 'MB /', totalMB, 'MB)');
          this._triggerMemoryCleanup();
        }
      }, CONSTANTS.MEMORY_CHECK_INTERVAL_MS);
    }
  }

  _triggerMemoryCleanup() {
    const viewport = {
      left: -this.camera.cx / this.camera.zoom,
      top: -this.camera.cy / this.camera.zoom,
      right: (window.innerWidth - this.camera.cx) / this.camera.zoom,
      bottom: (window.innerHeight - this.camera.cy) / this.camera.zoom
    };

    const freed = this.entityManager.unloadOffscreenImages(viewport);
    if (freed > 0) {
      console.log('[App] Memory cleanup: freed', freed, 'off-screen images');
    }

    if (window.gc) {
      window.gc();
    }
  }

  _stopMemoryMonitoring() {
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
      this.memoryCheckInterval = null;
    }
  }

  async _loadRecentProjects() {
    const projects = await window.api.recentProjects.validate();
    this._renderRecentProjects(projects);
  }

  _renderRecentProjects(projects) {
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
      date.textContent = this._formatDate(project.openedAt);

      info.appendChild(name);
      info.appendChild(pathEl);
      info.appendChild(date);

      item.appendChild(icon);
      item.appendChild(info);

      item.addEventListener('click', () => {
        this._openRecentProject(project.path);
      });

      this.recentProjectsList.appendChild(item);
    });
  }

  _formatDate(timestamp) {
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

  async _openRecentProject(path) {
    const exists = await window.api.fs.exists(path);
    if (!exists) {
      await window.api.recentProjects.remove(path);
      await this._loadRecentProjects();
      return;
    }

    const success = await this.projectManager.openProjectByPath(path);
    if (!success) {
      return;
    }

    await window.api.recentProjects.add(path);
    await this._loadRecentProjects();

    this.welcomeOverlay.classList.remove('active');
    this.statusProject.textContent = path;

    const config = this.projectManager.getConfig();
    this.camera.setState(config.canvas);
    this._updateCanvasTransform();

    await this.entityManager.loadAllImages();
    await this.frameManager.loadAllFrames();
    this._repositionImagesInFrames();
  }

  _setupEventListeners() {
    this.btnOpenProject.addEventListener('click', () => this._openProject());
    this.btnNewProject.addEventListener('click', () => this._createNewProject());

    this.viewport.addEventListener('wheel', this.boundHandlers.handleWheel, { passive: false });
    this.viewport.addEventListener('mousedown', this.boundHandlers.handleMouseDown);
    this.viewport.addEventListener('dragover', this.boundHandlers.handleDragOver);
    this.viewport.addEventListener('drop', this.boundHandlers.handleDrop);

    document.addEventListener('mousemove', this.boundHandlers.handleMouseMove);
    document.addEventListener('mouseup', this.boundHandlers.handleMouseUp);
    document.addEventListener('keydown', this.boundHandlers.handleKeyDown);
    document.addEventListener('keyup', this.boundHandlers.handleKeyUp);

    window.api.onRenderProcessGone((details) => {
      console.error('[App] Render process gone:', details.reason);
      this._handleRenderProcessGone(details);
    });
  }

  _handleRenderProcessGone(details) {
    console.warn('[App] Renderer crashed, attempting recovery...');

    this._stopMemoryMonitoring();

    this.entityManager.clearAll();
    this.frameManager.clearAll();

    this.camera.reset();
    this.projectManager.resetConfig();

    console.log('[App] Recovery complete. Please reopen project.');
  }

  async _ensureProjectOpen() {
    if (this.projectManager.getProjectPath()) {
      return true;
    }

    const path = await this.projectManager.openProject();
    if (!path) return false;

    this.welcomeOverlay.classList.remove('active');
    this.statusProject.textContent = path;

    const config = this.projectManager.getConfig();
    this.camera.setState(config.canvas);
    this._updateCanvasTransform();

    await this.entityManager.loadAllImages();
    await this.frameManager.loadAllFrames();
    this._repositionImagesInFrames();
    return true;
  }

  async _openProject() {
    const path = await this.projectManager.openProject();
    if (!path) return;

    await window.api.recentProjects.add(path);
    await this._loadRecentProjects();

    this.welcomeOverlay.classList.remove('active');
    this.statusProject.textContent = path;

    const config = this.projectManager.getConfig();
    this.camera.setState(config.canvas);
    this._updateCanvasTransform();

    await this.entityManager.loadAllImages();
    await this.frameManager.loadAllFrames();
    this._repositionImagesInFrames();
  }

  async _createNewProject() {
    const path = await window.api.dialog.openDirectory();
    if (!path) return;

    const filesDir = await window.api.path.join(path, 'files');
    await window.api.fs.mkdir(filesDir);

    const config = {
      canvas: { cx: 0, cy: 0, zoom: CONSTANTS.DEFAULT_ZOOM },
      images: [],
      frames: []
    };

    const configPath = await window.api.path.join(path, 'config.json');
    await window.api.fs.writeFile(configPath, JSON.stringify(config, null, 2));

    await window.api.recentProjects.add(path);
    await this._loadRecentProjects();

    this.welcomeOverlay.classList.remove('active');
    this.statusProject.textContent = path;

    this.projectManager.setProjectPath(path);
    this.projectManager.setConfig(config);
    this.camera.setState(config.canvas);
    this._updateCanvasTransform();
  }

  _alignSelected(direction) {
    const bounds = this.entityManager.getSelectionBounds();
    if (!bounds) return;

    this.entityManager.getSelectedIds().forEach(id => {
      const entity = this.entityManager.getEntity(id);
      if (!entity) return;

      const dims = this.entityManager._getEntityDimensions(entity);
      let newX = entity.data.x;
      let newY = entity.data.y;

      if (direction === 'left') {
        newX = Math.round(bounds.minX);
      } else if (direction === 'right') {
        newX = Math.round(bounds.maxX - dims.width);
      } else if (direction === 'top') {
        newY = Math.round(bounds.minY);
      } else if (direction === 'bottom') {
        newY = Math.round(bounds.maxY - dims.height);
      }

      entity.data.x = newX;
      entity.data.y = newY;
      const scale = entity.data.scale || 1;
      entity.element.style.transform = `translate(${newX}px, ${newY}px) scale(${scale})`;
      this.projectManager.updateImage(id, { x: newX, y: newY });
    });
  }

  _distributeHorizontally() {
    const entities = this.entityManager.getSelectedIds()
      .map(id => this.entityManager.getEntity(id))
      .filter(e => e)
      .map(e => ({
        id: e.data.id,
        x: e.data.x,
        y: e.data.y,
        dims: this.entityManager._getEntityDimensions(e)
      }));

    if (entities.length < 2) return;

    const minY = Math.min(...entities.map(e => e.y));
    entities.sort((a, b) => a.x - b.x);

    let currentX = entities[0].x;
    entities.forEach(entity => {
      entity.x = currentX;
      entity.y = minY;
      currentX += entity.dims.width + CONSTANTS.DISTRIBUTE_GAP;
    });

    this._applyEntityPositions(entities);
  }

  _distributeVertically() {
    const entities = this.entityManager.getSelectedIds()
      .map(id => this.entityManager.getEntity(id))
      .filter(e => e)
      .map(e => ({
        id: e.data.id,
        x: e.data.x,
        y: e.data.y,
        dims: this.entityManager._getEntityDimensions(e)
      }));

    if (entities.length < 2) return;

    const minX = Math.min(...entities.map(e => e.x));
    entities.sort((a, b) => a.y - b.y);

    let currentY = entities[0].y;
    entities.forEach(entity => {
      entity.x = minX;
      entity.y = currentY;
      currentY += entity.dims.height + CONSTANTS.DISTRIBUTE_GAP;
    });

    this._applyEntityPositions(entities);
  }

  _distributeToGrid() {
    const entities = this.entityManager.getSelectedIds()
      .map(id => this.entityManager.getEntity(id))
      .filter(e => e)
      .map(e => ({
        id: e.data.id,
        x: e.data.x,
        y: e.data.y,
        dims: this.entityManager._getEntityDimensions(e)
      }));

    if (entities.length < 2) return;

    const startX = entities[0].x;
    const startY = entities[0].y;
    const cols = CONSTANTS.DISTRIBUTE_GRID_COLS;
    const gap = CONSTANTS.DISTRIBUTE_GAP;

    entities.forEach((entity, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;

      entity.x = startX + col * (entity.dims.width + gap);
      entity.y = startY + row * (entity.dims.height + gap);
    });

    this._applyEntityPositions(entities);
  }

  async _openInExplorer() {
    const selectedIds = this.entityManager.getSelectedIds();
    if (selectedIds.length !== 1) {
      console.warn('[App] _openInExplorer: No single image selected, count:', selectedIds.length);
      return;
    }

    const entity = this.entityManager.getEntity(selectedIds[0]);
    if (!entity || !entity.data || !entity.data.name) {
      console.warn('[App] _openInExplorer: Entity has no valid data');
      return;
    }

    const projectPath = this.projectManager.getProjectPath();
    if (!projectPath) {
      console.warn('[App] _openInExplorer: No project path');
      return;
    }

    const filesDir = await window.api.fs.getFilesDir(projectPath);
    const fullPath = await window.api.path.join(filesDir, entity.data.name);

    console.log('[App] _openInExplorer:', fullPath);
    await window.api.shell.showItemInFolder(fullPath);
  }

  _applyEntityPositions(entities) {
    entities.forEach(entity => {
      const el = this.entityManager.getEntity(entity.id);
      if (el) {
        const roundedX = Math.round(entity.x);
        const roundedY = Math.round(entity.y);
        el.data.x = roundedX;
        el.data.y = roundedY;
        const elScale = el.data.scale || 1;
        el.element.style.transform = `translate(${roundedX}px, ${roundedY}px) scale(${elScale})`;
        this.projectManager.updateImage(entity.id, { x: entity.x, y: entity.y });
      }
    });
  }

  _repositionImagesInFrames() {
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
            const scale = entity.data.scale || 1;
            entity.element.style.transform = `translate(${Math.round(img.x - frame.data.x)}px, ${Math.round(img.y - frame.data.y)}px) scale(${scale})`;
          }
        }
      }
    });
  }

  async _addImages() {
    try {
      const hasProject = await this._ensureProjectOpen();
      if (!hasProject) return;

      const filePaths = await window.api.dialog.openFiles();
      if (!filePaths || filePaths.length === 0) {
        return;
      }

      for (const filePath of filePaths) {
        await this.entityManager.addImageFromFile(filePath);
      }

      this._updateCanvasTransform();
    } catch (error) {
      console.error('[App] Error in addImages():', error);
    }
  }

  _handleWheel(e) {
    e.preventDefault();

    const now = performance.now();
    if (now - this.lastWheelTime < CONSTANTS.WHEEL_THROTTLE_MS) return;
    this.lastWheelTime = now;

    const rect = this.viewport.getBoundingClientRect();
    this.camera.zoomToPoint(e.deltaY, e.clientX, e.clientY, rect);
    this._updateCanvasTransform();
    this.projectManager.updateCanvas(this.camera.getState());
    this._updateStatus();
  }

  _handleMouseDown(e) {
    if (e.button === 1 || (e.button === 0 && this.panState.spacePressed)) {
      e.preventDefault();
      this._startPan(e);
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
        this._startSelection(e);
      }
    }
  }

  _startSelection(e) {
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

  _updateSelection(e) {
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

  _endSelection() {
    if (!this.selectionState.isSelecting) return;

    this.selectionState.isSelecting = false;

    if (this.selectionState.rectElement) {
      this.selectionState.rectElement.style.display = 'none';
    }

    const screenLeft = Math.min(this.selectionState.startX, this.selectionState.currentX);
    const screenTop = Math.min(this.selectionState.startY, this.selectionState.currentY);
    const screenWidth = Math.abs(this.selectionState.currentX - this.selectionState.startX);
    const screenHeight = Math.abs(this.selectionState.currentY - this.selectionState.startY);

    if (screenWidth > CONSTANTS.SELECTION_MIN_SIZE || screenHeight > CONSTANTS.SELECTION_MIN_SIZE) {
      const viewportRect = this.viewport.getBoundingClientRect();
      const selRect = {
        x: (screenLeft - viewportRect.left - this.camera.cx) / this.camera.zoom,
        y: (screenTop - viewportRect.top - this.camera.cy) / this.camera.zoom,
        width: screenWidth / this.camera.zoom,
        height: screenHeight / this.camera.zoom
      };

      const selectedIds = this.entityManager.getEntitiesInRect(selRect);

      if (selectedIds.length > 0) {
        this.entityManager.clearSelection();
        selectedIds.forEach(id => this.entityManager.selectEntity(id, true));
      }
    }
  }

  _handleMouseMove(e) {
    if (this.panState.isPanning) {
      this._updatePan(e);
    } else if (this.selectionState.isSelecting) {
      this._updateSelection(e);
    } else if (this.frameManager.resizeState.isResizing) {
      this.frameManager.handleResize(e);
    } else if (this.frameManager.dragState.isDragging) {
      this.frameManager.handleDrag(e);
    } else if (this.entityManager.dragState.isDragging) {
      this.entityManager.handleDrag(e);
    }
  }

  _handleMouseUp() {
    if (this.panState.isPanning) {
      this._endPan();
    }
    if (this.selectionState.isSelecting) {
      this._endSelection();
    }
    if (this.frameManager.resizeState.isResizing) {
      this.frameManager.endResize();
    }
    if (this.frameManager.dragState.isDragging) {
      this.frameManager.endDrag();
    }
    this.entityManager.endDrag();
  }

  async _handleKeyDown(e) {
    if (e.code === 'Space' && !this.panState.spacePressed) {
      this.panState.spacePressed = true;
      this.viewport.classList.add('pan-mode');
    } else if (e.code === 'Escape') {
      this.entityManager.clearSelection();
      this.frameManager.deselectFrame();
    } else if (e.code === 'Delete' || e.code === 'Backspace') {
      if (this.entityManager.hasSelection()) {
        await this.entityManager.deleteSelected();
      } else {
        const draggingEntity = this.entityManager.dragState.entity;
        if (draggingEntity) {
          const id = draggingEntity.dataset.id;
          await this.entityManager.deleteEntity(id);
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
      this._updateCanvasTransform();
      this.projectManager.updateCanvas(this.camera.getState());
      this._updateStatus();
    }
  }

  _handleKeyUp(e) {
    if (e.code === 'Space') {
      this.panState.spacePressed = false;
      this.viewport.classList.remove('pan-mode');
    }
  }

  _handleDragOver(e) {
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

  async _handleDrop(e) {
    e.preventDefault();

    document.querySelectorAll('.frame-container').forEach(el => {
      el.classList.remove('drag-over');
    });

    const frameEl = e.target.closest('.frame-container');
    const files = Array.from(e.dataTransfer.files);

    const hasProject = await this._ensureProjectOpen();
    if (!hasProject) return;

    if (files.length > 0) {
      for (const file of files) {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (CONSTANTS.IMAGE_EXTENSIONS.includes(ext)) {
          const filePath = await window.api.webUtils.getPathForFile(file);
          const imageData = await this.entityManager.addImageFromFile(filePath);
          if (frameEl && imageData) {
            const frameId = frameEl.dataset.id;
            const frame = this.frameManager.getFrame(frameId);
            if (frame) {
              const rect = frameEl.getBoundingClientRect();
              const dropX = (e.clientX - rect.left) / this.camera.zoom;
              const dropY = (e.clientY - rect.top) / this.camera.zoom;

              this._attachImageToFrame(imageData.id, frameId, frame.data.x + dropX, frame.data.y + dropY, frameEl);
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

          this._attachImageToFrame(imageId, frameId, frame.data.x + dropX, frame.data.y + dropY, frameEl);
        }
      }
    }

    this._updateCanvasTransform();
  }

  _attachImageToFrame(imageId, frameId, canvasX, canvasY, frameEl) {
    const entity = this.entityManager.getEntity(imageId);
    if (!entity) return;

    const frame = this.frameManager.getFrame(frameId);
    if (!frame) return;

    const contentEl = frameEl.querySelector('.frame-content');
    contentEl.appendChild(entity.element);

    const scale = entity.data.scale || 1;
    entity.element.style.transform = `translate(${Math.round(canvasX - frame.data.x)}px, ${Math.round(canvasY - frame.data.y)}px) scale(${scale})`;

    this.entityManager.attachImageToFrame(imageId, frameId, canvasX, canvasY);
  }

  _startPan(e) {
    this.panState.isPanning = true;
    this.panState.startX = e.clientX;
    this.panState.startY = e.clientY;
    this.panState.startCx = this.camera.cx;
    this.panState.startCy = this.camera.cy;
    this.viewport.classList.add('panning');
  }

  _updatePan(e) {
    const dx = e.clientX - this.panState.startX;
    const dy = e.clientY - this.panState.startY;

    this.camera.cx = Math.round(this.panState.startCx + dx);
    this.camera.cy = Math.round(this.panState.startCy + dy);

    this._updateCanvasTransform();
  }

  _endPan() {
    this.panState.isPanning = false;
    this.viewport.classList.remove('panning');
    this.projectManager.updateCanvas(this.camera.getState());
  }

  _updateCanvasTransform() {
    this.camera.applyToElement(this.canvas);
    this._updateStatus();
  }

  _updateStatus() {
    this.statusZoom.textContent = `${Math.round(this.camera.zoom * 100)}%`;
  }

  _resetZoom() {
    this.camera.reset();
    this._updateCanvasTransform();
    this.projectManager.updateCanvas(this.camera.getState());
    this._updateStatus();
  }

  async _createFrame() {
    const hasProject = await this._ensureProjectOpen();
    if (!hasProject) return;
    await this.frameManager.addFrame();
  }

  _deleteSelectedFrame() {
    if (this.frameManager.selectedFrame) {
      const id = this.frameManager.selectedFrame.dataset.id;
      this.frameManager.deleteFrame(id);
    }
  }

  _clearSelectedFrame() {
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
              const scale = entity.data.scale || 1;
              entity.element.style.transform = `translate(${Math.round(img.x)}px, ${Math.round(img.y)}px) scale(${scale})`;
            }
          }
        });
      }
    }
  }

  _bringSelectedFrameToFront() {
    if (this.frameManager.selectedFrame) {
      const id = this.frameManager.selectedFrame.dataset.id;
      const frame = this.frameManager.getFrame(id);
      if (frame) {
        this.frameManager.bringToFront(this.frameManager.selectedFrame, frame.data);
      }
    }
  }

  _toggleFrameLock() {
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

  async _handleFilesFromIPC(paths) {
    if (!paths || paths.length === 0) return;

    const hasProject = await this._ensureProjectOpen();
    if (!hasProject) return;

    for (const filePath of paths) {
      const ext = '.' + filePath.split('.').pop().toLowerCase();
      if (CONSTANTS.IMAGE_EXTENSIONS.includes(ext)) {
        await this.entityManager.addImageFromFile(filePath);
      }
    }

    this._updateCanvasTransform();
  }

  destroy() {
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
      this.memoryCheckInterval = null;
    }

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
  window.api.onContextMenuAction((action) => {
    if (!window.app) {
      console.error('[IPC] App not initialized yet!');
      return;
    }

    const actionMap = {
      'add-images': () => window.app._addImages(),
      'open-project': () => window.app._openProject(),
      'reset-zoom': () => window.app._resetZoom(),
      'create-frame': () => window.app._createFrame(),
      'delete-frame': () => window.app._deleteSelectedFrame(),
      'clear-frame': () => window.app._clearSelectedFrame(),
      'bring-to-front': () => window.app._bringSelectedFrameToFront(),
      'lock-frame': () => window.app._toggleFrameLock(),
      'align-left': () => window.app._alignSelected('left'),
      'align-right': () => window.app._alignSelected('right'),
      'align-top': () => window.app._alignSelected('top'),
      'align-bottom': () => window.app._alignSelected('bottom'),
      'distribute-horizontally': () => window.app._distributeHorizontally(),
      'distribute-vertically': () => window.app._distributeVertically(),
      'distribute-to-grid': () => window.app._distributeToGrid(),
      'open-in-explorer': () => window.app._openInExplorer()
    };

    const handler = actionMap[action];
    if (handler) {
      handler();
    }
  });

  window.api.onFilesDropped((paths) => {
    if (!window.app) {
      console.error('[IPC] App not initialized yet!');
      return;
    }
    window.app._handleFilesFromIPC(paths);
  });

  window.app = new App();
});
