const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),
  onToggleRobot: (cb) => ipcRenderer.on('toggle-robot', cb),
  setRobotStatus: (status) => ipcRenderer.send('robot-status', status),
  quit: () => ipcRenderer.send('quit-app'),
  platform: process.platform,
  version: process.env.npm_package_version || '1.0.0',
})
