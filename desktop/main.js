/**
 * 视频批量截图工具 - 桌面壳主进程
 * 职责：启动本地服务 → 等待就绪 → 开一个应用窗口加载界面
 */
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');

const APP_TITLE = '视频批量截图工具';
const BASE_PORT = 7788;

let mainWindow = null;
let serverProc = null;
let serverPort = 0;
let serverLog = [];

/* ------------------------- 端口与就绪探测 ------------------------- */
function pickPort(start = BASE_PORT) {
  return new Promise((resolve) => {
    const tryPort = (p) => {
      const s = net.createServer();
      s.once('error', () => { try { s.close(); } catch { } tryPort(p + 1); });
      s.once('listening', () => s.close(() => resolve(p)));
      s.listen(p, '127.0.0.1');
    };
    tryPort(start);
  });
}

function ping(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/ping', timeout: 800 }, (res) => {
      let d = '';
      res.on('data', c => { d += c; });
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

async function waitReady(port, timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = await ping(port);
    if (r && r.vshot) return r;
    await new Promise(r => setTimeout(r, 200));
  }
  return null;
}

/* ---------------------------- 启动服务 ---------------------------- */
function startServer(port) {
  const script = path.join(__dirname, 'server.js');
  serverProc = spawn(process.execPath, [script], {
    cwd: __dirname,
    env: {
      ...process.env,
      PORT: String(port),
      NO_OPEN: '1',
      ELECTRON_RUN_AS_NODE: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  const collect = (buf) => {
    const s = buf.toString('utf8');
    serverLog.push(s);
    if (serverLog.length > 60) serverLog = serverLog.slice(-60);
    if (!app.isPackaged) process.stdout.write(s);
  };
  serverProc.stdout.on('data', collect);
  serverProc.stderr.on('data', collect);

  serverProc.on('exit', (code) => {
    if (code !== 0 && !app.isQuitting) {
      const tail = serverLog.join('').slice(-1200);
      dialog.showErrorBox('服务异常退出', `退出代码：${code}\n\n${tail}`);
      app.quit();
    }
  });
}

/* ---------------------------- 创建窗口 ---------------------------- */
function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1080,
    minHeight: 660,
    title: APP_TITLE,
    backgroundColor: '#f4f6fa',
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      sandbox: false
    }
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}/`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // 外链走系统浏览器，窗口内只允许本地地址
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`http://127.0.0.1:${port}`)) e.preventDefault();
  });

  // 拖入文件时禁止窗口导航到 file://
  mainWindow.webContents.on('will-attach-webview', (e) => e.preventDefault());

  mainWindow.on('closed', () => { mainWindow = null; });
}

/* ------------------------------ 启动 ------------------------------ */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);

    serverPort = await pickPort();
    startServer(serverPort);

    const info = await waitReady(serverPort);
    if (!info) {
      dialog.showErrorBox(
        '启动失败',
        '本地服务没有在预期时间内就绪。\n\n' + serverLog.join('').slice(-1500)
      );
      app.quit();
      return;
    }

    createWindow(serverPort);
  });

  app.on('window-all-closed', () => {
    app.isQuitting = true;
    if (serverProc) { try { serverProc.kill(); } catch { } }
    app.quit();
  });

  app.on('before-quit', () => {
    app.isQuitting = true;
    if (serverProc) { try { serverProc.kill(); } catch { } }
  });
}
