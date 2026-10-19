// Narrow bridge between the pet page and the main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  onUsage: (cb) => ipcRenderer.on('usage:update', (_e, s) => cb(s)),
  getState: () => ipcRenderer.invoke('pet:get-state'),
  hit: (over) => ipcRenderer.send('pet:hit', over),
  dragStart: (p) => ipcRenderer.send('pet:drag-start', p),
  drag: (p) => ipcRenderer.send('pet:drag', p),
  dragEnd: () => ipcRenderer.send('pet:drag-end'),
  menu: () => ipcRenderer.send('pet:menu'),
  openClaude: () => ipcRenderer.send('pet:open-claude'),
  login: () => ipcRenderer.send('pet:login'),
  refresh: () => ipcRenderer.send('pet:refresh'),
  cursor: () => ipcRenderer.invoke('pet:cursor'),
});
