const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
    openFiles: () => ipcRenderer.invoke('dialog:openFiles')
  },
  
  fs: {
    readDir: (dirPath) => ipcRenderer.invoke('fs:readDir', dirPath),
    exists: (filePath) => ipcRenderer.invoke('fs:exists', filePath),
    mkdir: (dirPath) => ipcRenderer.invoke('fs:mkdir', dirPath),
    copyFile: (src, dest) => ipcRenderer.invoke('fs:copyFile', src, dest),
    readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
    writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
    getFilesDir: (projectPath) => ipcRenderer.invoke('fs:getFilesDir', projectPath),
    getConfigPath: (projectPath) => ipcRenderer.invoke('fs:getConfigPath', projectPath)
  },
  
  path: {
    join: (...args) => ipcRenderer.invoke('path:join', args),
    basename: (filePath) => ipcRenderer.invoke('path:basename', filePath),
    extname: (filePath) => ipcRenderer.invoke('path:extname', filePath),
    toFileURL: (filePath) => ipcRenderer.invoke('path:toFileURL', filePath)
  },
  
  crypto: {
    randomUUID: () => ipcRenderer.invoke('crypto:randomUUID')
  },
  
  webUtils: {
    getPathForFile: (file) => ipcRenderer.invoke('webUtils:getPathForFile', file)
  },
  
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized')
  },
  
  onFilesDropped: (callback) => {
    ipcRenderer.on('files-dropped', (event, paths) => {
      callback(paths);
    });
  },
  
  onContextMenuAction: (callback) => {
    ipcRenderer.on('context-menu-action', (event, action) => {
      callback(action);
    });
  },
  
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});
