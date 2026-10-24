const { contextBridge, ipcRenderer } = require('electron');

const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('api', {
  all: call('db:all'),
  run: call('db:run'),
  exportJson: call('data:exportJson'),
  exportCsv: call('data:exportCsv'),
  importJson: call('data:importJson'),
  backup: call('data:backup'),
  reset: call('data:reset'),
  openDataDir: call('data:openDir'),
  addFramePreset: call('frames:preset'),
});
