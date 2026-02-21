const { app, BrowserWindow, ipcMain, dialog, webUtils, Menu, shell, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const url = require('url');
const crypto = require('crypto');
const thumbnailService = require('./thumbnail-service');

if (process.platform === 'linux') {
  process.env.GTK_USE_PORTAL = '1';
}

const RECENT_PROJECTS_MAX = 5;

app.commandLine.appendSwitch('disable-accelerated-video-decode');
app.commandLine.appendSwitch('disable-gpu-memory-buffer-compositor-resources');
app.commandLine.appendSwitch('disable-accelerated-2d-canvas');

let mainWindow;

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#1a1a1a',
    minWidth: 600,
    minHeight: 400,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });

  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('[MAIN] Render process gone:', details.reason);
    mainWindow.webContents.send('render-process-gone', details);
  });

  mainWindow.webContents.on('console-message', (event, level, message) => {
    if (level >= 2) {
      console.warn('[RENDERER CONSOLE]', message);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('context-menu', (event, params) => {
    const template = [
      {
        label: 'Add Images',
        click: () => {
          mainWindow.webContents.send('context-menu-action', 'add-images');
        }
      },
      {
        label: 'Open in Explorer',
        click: () => {
          mainWindow.webContents.send('context-menu-action', 'open-in-explorer');
        }
      },
      {
        label: 'Create Frame',
        click: () => {
          mainWindow.webContents.send('context-menu-action', 'create-frame');
        }
      },
      { type: 'separator' },
      {
        label: 'Delete Frame',
        click: () => {
          mainWindow.webContents.send('context-menu-action', 'delete-frame');
        }
      },
      {
        label: 'Clear Frame',
        click: () => {
          mainWindow.webContents.send('context-menu-action', 'clear-frame');
        }
      },
      {
        label: 'Lock Frame',
        click: () => {
          mainWindow.webContents.send('context-menu-action', 'lock-frame');
        }
      },
      { type: 'separator' },
      {
        label: 'Align Left',
        click: () => {
          mainWindow.webContents.send('context-menu-action', 'align-left');
        }
      },
      {
        label: 'Align Right',
        click: () => {
          mainWindow.webContents.send('context-menu-action', 'align-right');
        }
      },
      {
        label: 'Align Top',
        click: () => {
          mainWindow.webContents.send('context-menu-action', 'align-top');
        }
      },
      {
        label: 'Align Bottom',
        click: () => {
          mainWindow.webContents.send('context-menu-action', 'align-bottom');
        }
      },
      { type: 'separator' },
      {
        label: 'Distribute Horizontally',
        click: () => {
          mainWindow.webContents.send('context-menu-action', 'distribute-horizontally');
        }
      },
      {
        label: 'Distribute Vertically',
        click: () => {
          mainWindow.webContents.send('context-menu-action', 'distribute-vertically');
        }
      },
      {
        label: 'Distribute to Grid',
        click: () => {
          mainWindow.webContents.send('context-menu-action', 'distribute-to-grid');
        }
      }
    ];

    const contextMenu = Menu.buildFromTemplate(template);
    contextMenu.popup({ window: mainWindow });
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const filePath = request.url.replace('app://localhost/', '');
    return url.pathToFileURL(decodeURIComponent(filePath));
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function isValidPath(filePath, allowedBasePath = null) {
  if (typeof filePath !== 'string' || filePath.length === 0 || filePath.length >= 4096) {
    return false;
  }

  const resolved = path.resolve(filePath);

  if (allowedBasePath) {
    const allowedResolved = path.resolve(allowedBasePath);
    if (!resolved.startsWith(allowedResolved + path.sep) && resolved !== allowedResolved) {
      return false;
    }
  }

  return true;
}

ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle('dialog:openFiles', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Images', extensions: IMAGE_EXTENSIONS }
      ]
    });

    if (result.canceled) {
      return [];
    }

    return result.filePaths;
  } catch (error) {
    console.error('[IPC] dialog:openFiles error:', error);
    return [];
  }
});

ipcMain.handle('fs:readDir', async (event, dirPath) => {
  if (!isValidPath(dirPath)) {
    return { success: false, error: 'Invalid directory path' };
  }
  try {
    const items = await fsPromises.readdir(dirPath);
    return { success: true, data: items };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fs:exists', async (event, filePath) => {
  if (!isValidPath(filePath)) {
    return false;
  }
  try {
    await fsPromises.access(filePath);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('fs:mkdir', async (event, dirPath) => {
  if (!isValidPath(dirPath)) {
    return { success: false, error: 'Invalid directory path' };
  }
  try {
    await fsPromises.mkdir(dirPath, { recursive: true });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fs:copyFile', async (event, src, dest) => {
  if (!isValidPath(src) || !isValidPath(dest)) {
    return { success: false, error: 'Invalid file path' };
  }
  try {
    await fsPromises.copyFile(src, dest);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fs:readFile', async (event, filePath) => {
  if (!isValidPath(filePath)) {
    return { success: false, error: 'Invalid file path' };
  }
  try {
    const content = await fsPromises.readFile(filePath, 'utf8');
    return { success: true, data: content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fs:writeFile', async (event, filePath, content) => {
  if (!isValidPath(filePath)) {
    return { success: false, error: 'Invalid file path' };
  }
  if (typeof content !== 'string') {
    return { success: false, error: 'Invalid content' };
  }
  try {
    await fsPromises.writeFile(filePath, content, 'utf8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fs:deleteFile', async (event, filePath) => {
  if (!isValidPath(filePath)) {
    return { success: false, error: 'Invalid file path' };
  }
  try {
    const normalizedPath = path.normalize(filePath);
    await fsPromises.unlink(normalizedPath);
    return { success: true };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { success: true };
    }
    console.error('[IPC] fs:deleteFile error:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fs:getFilesDir', async (event, projectPath) => {
  if (!isValidPath(projectPath)) {
    return null;
  }
  return path.join(projectPath, 'files');
});

ipcMain.handle('fs:getConfigPath', async (event, projectPath) => {
  if (!isValidPath(projectPath)) {
    return null;
  }
  return path.join(projectPath, 'config.json');
});

ipcMain.handle('path:join', async (event, ...args) => {
  if (!args.every(arg => typeof arg === 'string')) {
    return '';
  }
  return path.join(...args);
});

ipcMain.handle('path:basename', async (event, filePath) => {
  if (!isValidPath(filePath)) {
    return '';
  }
  return path.basename(filePath);
});

ipcMain.handle('path:extname', async (event, filePath) => {
  if (!isValidPath(filePath)) {
    return '';
  }
  return path.extname(filePath);
});

ipcMain.handle('path:toFileURL', async (event, filePath) => {
  if (!isValidPath(filePath)) {
    return '';
  }
  return url.pathToFileURL(filePath).href;
});

ipcMain.handle('crypto:randomUUID', async () => {
  return crypto.randomUUID();
});

ipcMain.handle('webUtils:getPathForFile', async (event, file) => {
  if (!file) {
    return '';
  }
  return webUtils.getPathForFile(file);
});

ipcMain.handle('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('window:close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('window:isMaximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

const getConfigDir = () => {
  const home = app.getPath('home');
  return path.join(home, '.config', 'zmref');
};

const getRecentProjectsPath = () => {
  return path.join(getConfigDir(), 'recent-projects.json');
};

const ensureConfigDir = async () => {
  const configPath = getConfigDir();
  try {
    await fsPromises.mkdir(configPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
  return configPath;
};

ipcMain.handle('recent-projects:get', async () => {
  try {
    await ensureConfigDir();
    const filePath = getRecentProjectsPath();
    try {
      const data = await fsPromises.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  } catch (error) {
    console.error('[IPC] recent-projects:get error:', error);
    return [];
  }
});

ipcMain.handle('recent-projects:add', async (event, projectPath) => {
  if (!isValidPath(projectPath)) {
    return { success: false, error: 'Invalid project path' };
  }
  try {
    await ensureConfigDir();
    const filePath = getRecentProjectsPath();
    let projects = [];

    try {
      const data = await fsPromises.readFile(filePath, 'utf8');
      projects = JSON.parse(data);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    projects = projects.filter(p => p.path !== projectPath);
    projects.unshift({ path: projectPath, openedAt: Date.now() });
    projects = projects.slice(0, RECENT_PROJECTS_MAX);

    await fsPromises.writeFile(filePath, JSON.stringify(projects, null, 2));
    return { success: true };
  } catch (error) {
    console.error('[IPC] recent-projects:add error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('recent-projects:validate', async () => {
  try {
    const filePath = getRecentProjectsPath();
    try {
      const data = await fsPromises.readFile(filePath, 'utf8');
      let projects = JSON.parse(data);
      const validProjects = [];

      for (const project of projects) {
        if (!isValidPath(project.path)) continue;
        const configFile = path.join(project.path, 'config.json');
        try {
          await fsPromises.access(configFile);
          validProjects.push(project);
        } catch {
          // Skip invalid projects
        }
      }

      if (validProjects.length !== projects.length) {
        await fsPromises.writeFile(filePath, JSON.stringify(validProjects, null, 2));
      }

      return validProjects;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  } catch (error) {
    console.error('[IPC] recent-projects:validate error:', error);
    return [];
  }
});

ipcMain.handle('recent-projects:remove', async (event, projectPath) => {
  if (!isValidPath(projectPath)) {
    return { success: false, error: 'Invalid project path' };
  }
  try {
    const filePath = getRecentProjectsPath();
    try {
      const data = await fsPromises.readFile(filePath, 'utf8');
      let projects = JSON.parse(data);
      projects = projects.filter(p => p.path !== projectPath);
      await fsPromises.writeFile(filePath, JSON.stringify(projects, null, 2));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { success: true };
      }
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('[IPC] recent-projects:remove error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('shell:showItemInFolder', async (event, filePath) => {
  if (!isValidPath(filePath)) {
    return { success: false, error: 'Invalid file path' };
  }
  try {
    shell.showItemInFolder(filePath);
    return { success: true };
  } catch (error) {
    console.error('[IPC] shell:showItemInFolder error:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('thumbnail:generate', async (event, srcPath, destPath) => {
  if (!isValidPath(srcPath) || !isValidPath(destPath)) {
    return { success: false, error: 'Invalid path' };
  }
  try {
    const result = await thumbnailService.generateThumbnail(srcPath, destPath);
    return result;
  } catch (error) {
    console.error('[IPC] thumbnail:generate error:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('thumbnail:exists', async (event, thumbPath) => {
  if (!isValidPath(thumbPath)) {
    return false;
  }
  try {
    return await thumbnailService.thumbnailExists(thumbPath);
  } catch (error) {
    console.error('[IPC] thumbnail:exists error:', error.message);
    return false;
  }
});

ipcMain.handle('thumbnail:getPath', async (event, thumbsDir, imageId) => {
  if (!isValidPath(thumbsDir)) {
    return '';
  }
  try {
    return thumbnailService.getThumbnailPath(thumbsDir, imageId);
  } catch (error) {
    console.error('[IPC] thumbnail:getPath error:', error.message);
    return '';
  }
});

ipcMain.handle('thumbnail:delete', async (event, thumbPath) => {
  if (!isValidPath(thumbPath)) {
    return { success: false, error: 'Invalid path' };
  }
  try {
    const result = await thumbnailService.deleteThumbnail(thumbPath);
    return result;
  } catch (error) {
    console.error('[IPC] thumbnail:delete error:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('thumbnail:ensureThumbsDir', async (event, projectPath) => {
  if (!isValidPath(projectPath)) {
    return { success: false, error: 'Invalid project path' };
  }
  try {
    const result = await thumbnailService.ensureThumbsDir(projectPath);
    return result;
  } catch (error) {
    console.error('[IPC] thumbnail:ensureThumbsDir error:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('thumbnail:ensure', async (event, srcPath, thumbsDir, imageId) => {
  if (!isValidPath(srcPath) || !isValidPath(thumbsDir)) {
    return { success: false, error: 'Invalid path' };
  }
  try {
    const result = await thumbnailService.ensureThumbnail(srcPath, thumbsDir, imageId);
    return result;
  } catch (error) {
    console.error('[IPC] thumbnail:ensure error:', error.message);
    return { success: false, error: error.message };
  }
});

