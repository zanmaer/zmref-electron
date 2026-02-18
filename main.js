const { app, BrowserWindow, ipcMain, dialog, webUtils, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

process.env.GTK_USE_PORTAL = '1';

app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-accelerated-video-decode');
app.commandLine.appendSwitch('disable-gpu-memory-buffer-compositor-resources');
app.commandLine.appendSwitch('disable-gpu-rasterization');
app.commandLine.appendSwitch('disable-accelerated-2d-canvas');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

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
      webSecurity: false
    }
  });

  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('[MAIN] Render process gone:', details);
  });

  mainWindow.on('crashed', () => {
    console.error('[MAIN] Renderer crashed');
  });

  mainWindow.on('console-message', (event, level, message) => {
    if (level >= 2) {
      console.warn('[RENDERER CONSOLE]', message);
    }
  });

  mainWindow.on('drop-files', (event, paths) => {
    console.log('[MAIN] Files dropped:', paths);
    mainWindow.webContents.send('files-dropped', paths);
  });

  mainWindow.webContents.on('context-menu', (event, params) => {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Add Images',
        click: () => {
          mainWindow.webContents.send('context-menu-action', 'add-images');
        }
      },
      {
        label: 'Bring to Front',
        click: () => {
          mainWindow.webContents.send('context-menu-action', 'bring-to-front');
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
      { type: 'separator' },
      {
        label: 'Reset Zoom',
        click: () => {
          mainWindow.webContents.send('context-menu-action', 'reset-zoom');
        }
      }
    ]);
    contextMenu.popup({ window: mainWindow });
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('dialog:openDirectory', async () => {
  console.log('[IPC] dialog:openDirectory called');
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  console.log('[IPC] dialog result:', result);
  
  if (result.canceled) {
    return null;
  }
  
  return result.filePaths[0];
});

ipcMain.handle('dialog:openFiles', async () => {
  console.log('[IPC] dialog:openFiles called');
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Images', extensions: IMAGE_EXTENSIONS }
      ]
    });
    
    console.log('[IPC] dialog result:', result);
    
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
  try {
    const items = fs.readdirSync(dirPath);
    return { success: true, data: items };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fs:exists', async (event, filePath) => {
  return fs.existsSync(filePath);
});

ipcMain.handle('fs:mkdir', async (event, dirPath) => {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fs:copyFile', async (event, src, dest) => {
  try {
    fs.copyFileSync(src, dest);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fs:readFile', async (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return { success: true, data: content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fs:writeFile', async (event, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fs:getFilesDir', async (event, projectPath) => {
  return path.join(projectPath, 'files');
});

ipcMain.handle('fs:getConfigPath', async (event, projectPath) => {
  return path.join(projectPath, 'config.json');
});

ipcMain.handle('path:join', async (event, ...args) => {
  return path.join(...args);
});

ipcMain.handle('path:basename', async (event, filePath) => {
  return path.basename(filePath);
});

ipcMain.handle('path:extname', async (event, filePath) => {
  return path.extname(filePath);
});

ipcMain.handle('path:toFileURL', async (event, filePath) => {
  const { pathToFileURL } = require('url');
  return pathToFileURL(filePath).href;
});

ipcMain.handle('crypto:randomUUID', async () => {
  return require('crypto').randomUUID();
});

ipcMain.handle('webUtils:getPathForFile', async (event, file) => {
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

const getConfigPath = () => {
  const home = app.getPath('home');
  return path.join(home, '.config', 'zmboard_electron');
};

const getRecentProjectsPath = () => {
  return path.join(getConfigPath(), 'recent-projects.json');
};

const ensureConfigDir = () => {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    fs.mkdirSync(configPath, { recursive: true });
  }
  return configPath;
};

ipcMain.handle('recent-projects:get', async () => {
  try {
    ensureConfigDir();
    const filePath = getRecentProjectsPath();
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[IPC] recent-projects:get error:', error);
    return [];
  }
});

ipcMain.handle('recent-projects:add', async (event, projectPath) => {
  try {
    ensureConfigDir();
    const filePath = getRecentProjectsPath();
    let projects = [];
    
    if (fs.existsSync(filePath)) {
      projects = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    
    projects = projects.filter(p => p.path !== projectPath);
    projects.unshift({ path: projectPath, openedAt: Date.now() });
    projects = projects.slice(0, 5);
    
    fs.writeFileSync(filePath, JSON.stringify(projects, null, 2));
    return { success: true };
  } catch (error) {
    console.error('[IPC] recent-projects:add error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('recent-projects:validate', async () => {
  try {
    const filePath = getRecentProjectsPath();
    if (!fs.existsSync(filePath)) {
      return [];
    }
    
    let projects = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const validProjects = [];
    
    for (const project of projects) {
      const configFile = path.join(project.path, 'config.json');
      if (fs.existsSync(configFile)) {
        validProjects.push(project);
      }
    }
    
    if (validProjects.length !== projects.length) {
      fs.writeFileSync(filePath, JSON.stringify(validProjects, null, 2));
    }
    
    return validProjects;
  } catch (error) {
    console.error('[IPC] recent-projects:validate error:', error);
    return [];
  }
});

ipcMain.handle('recent-projects:remove', async (event, projectPath) => {
  try {
    const filePath = getRecentProjectsPath();
    if (!fs.existsSync(filePath)) {
      return { success: true };
    }
    
    let projects = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    projects = projects.filter(p => p.path !== projectPath);
    fs.writeFileSync(filePath, JSON.stringify(projects, null, 2));
    
    return { success: true };
  } catch (error) {
    console.error('[IPC] recent-projects:remove error:', error);
    return { success: false, error: error.message };
  }
});
