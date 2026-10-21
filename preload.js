const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cinema', {
  getLibrary: () => ipcRenderer.invoke('library:get'),
  refreshLibrary: () => ipcRenderer.invoke('library:refresh'),
  addFolder: () => ipcRenderer.invoke('library:add-folder'),
  removeFolder: folder => ipcRenderer.invoke('library:remove-folder', folder),
  playVideo: filePath => ipcRenderer.invoke('library:play', filePath),
  showInFolder: filePath => ipcRenderer.invoke('library:show-in-folder', filePath),
  getSettingsPath: () => ipcRenderer.invoke('library:settings-path'),
  saveTmdbKey: key => ipcRenderer.invoke('library:save-tmdb-key', key),
  clearMetadata: () => ipcRenderer.invoke('library:clear-metadata'),
  toggleFullscreen: () => ipcRenderer.invoke('window:fullscreen')
});
