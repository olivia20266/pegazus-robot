const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')

let mainWindow = null
let tray = null
let robotInterval = null

// ── Créer la fenêtre principale ──────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#06080e',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    frame: true,
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
  })

  mainWindow.loadFile(path.join(__dirname, 'index.html'))

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // Minimiser dans le tray au lieu de fermer
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow.hide()
      if (process.platform !== 'darwin') {
        showNotification('Pegazus Robot', 'Robot still running in background')
      }
    }
  })
}

// ── Tray (icône barre des tâches) ────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, '../assets/tray-icon.png')
  tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }))

  const updateTrayMenu = (robotStatus = false) => {
    const menu = Menu.buildFromTemplate([
      { label: 'Pegazus Robot', enabled: false },
      { type: 'separator' },
      { label: robotStatus ? '🟢 Robot ACTIVE' : '🔴 Robot STOPPED', enabled: false },
      { type: 'separator' },
      { label: 'Open Dashboard', click: () => mainWindow.show() },
      { label: robotStatus ? 'Stop Robot' : 'Start Robot', click: () => {
        mainWindow.show()
        mainWindow.webContents.send('toggle-robot')
      }},
      { type: 'separator' },
      { label: 'Quit', click: () => { app.isQuitting = true; app.quit() } },
    ])
    tray.setContextMenu(menu)
    tray.setToolTip(`Pegazus Robot — ${robotStatus ? 'ACTIVE' : 'STOPPED'}`)
  }

  updateTrayMenu(false)
  tray.on('double-click', () => mainWindow.show())

  ipcMain.on('robot-status', (_, status) => updateTrayMenu(status))
}

function showNotification(title, body) {
  new Notification({ title, body, icon: path.join(__dirname, '../assets/icon.png') }).show()
}

// ── IPC handlers ─────────────────────────────────────────────
ipcMain.on('notify', (_, { title, body }) => showNotification(title, body))
ipcMain.on('quit-app', () => { app.isQuitting = true; app.quit() })

// ── Auto updater ─────────────────────────────────────────────
function setupAutoUpdater() {
  autoUpdater.autoDownload = true
  autoUpdater.checkForUpdatesAndNotify()
  autoUpdater.on('update-downloaded', () => {
    showNotification('Update ready', 'Pegazus Robot will restart to install update')
    setTimeout(() => autoUpdater.quitAndInstall(), 3000)
  })
}

// ── App lifecycle ─────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow()
  createTray()
  if (process.env.NODE_ENV !== 'development') {
    try { setupAutoUpdater() } catch(e) {}
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
  else mainWindow.show()
})
