const { app, BrowserWindow, ipcMain, dialog, webUtils, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

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
        label: 'Open Project',
        click: () => {
          mainWindow.webContents.send('context-menu-action', 'open-project');
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

ipcMain.handle('path:join', async (event, args) => {
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
