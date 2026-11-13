/**
 * 仅用于宣传片素材采集：截取真实界面（屏幕物理上限 1920×1040）
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const http = require('http');
const net = require('net');
const fs = require('fs');
const { spawn } = require('child_process');

const OUT = process.argv[2] || path.join(__dirname, '..', 'promo-film', 'materials');
const VIDEO_DIR = 'H:\\2026年项目工程\\AI杂项\\AI视频';

app.disableHardwareAcceleration();

function pickPort(start = 7801) {
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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  const port = await pickPort();
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(port), NO_OPEN: '1', ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  proc.stdout.on('data', d => process.stdout.write('[srv] ' + d));
  proc.stderr.on('data', d => process.stderr.write('[srv-err] ' + d));

  for (let i = 0; i < 100; i++) {
    const r = await ping(port);
    if (r && r.vshot) break;
    await sleep(200);
  }
  console.log('server ready on', port);

  const win = new BrowserWindow({
    width: 1920,
    height: 1040,
    show: true,
    frame: false,
    backgroundColor: '#f5f6f8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  await win.loadURL(`http://127.0.0.1:${port}/`);
  await sleep(900);

  await win.webContents.executeJavaScript(`
    (() => {
      const inp = document.querySelector('#pathInput');
      inp.value = ${JSON.stringify(VIDEO_DIR)};
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      return true;
    })()
  `);

  // 等 14 张缩略图 ffmpeg 全部出图
  for (let i = 0; i < 200; i++) {
    const state = await win.webContents.executeJavaScript(`
      (() => {
        const imgs = [...document.querySelectorAll('.thumb img')];
        return { cards: document.querySelectorAll('.card').length, imgs: imgs.length, loaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length };
      })()
    `);
    if (i % 5 === 0) console.log('state', JSON.stringify(state));
    if (state.cards >= 14 && state.loaded >= 14) { console.log('all thumbs ready'); break; }
    await sleep(500);
  }
  await sleep(1500);

  const shot = async (name) => {
    const img = await win.capturePage();
    fs.writeFileSync(path.join(OUT, name), img.toPNG());
    console.log('saved', name, JSON.stringify(img.getSize()));
  };

  await shot('ui-full.png');

  // 打开第一张卡片的大图调整弹窗
  const r = await win.webContents.executeJavaScript(`
    (() => {
      const btn = [...document.querySelectorAll('.card button')].find(x => /调整/.test(x.textContent));
      if (!btn) return 'no-btn';
      btn.click();
      return 'clicked';
    })()
  `);
  console.log('modal:', r);
  await sleep(3000);
  await shot('ui-modal.png');

  await win.webContents.executeJavaScript(`document.querySelectorAll('[data-close]').forEach(b => b.click()); true`);
  await sleep(700);

  // 拖拽遮罩：直接显示 dropzone 元素
  await win.webContents.executeJavaScript(`
    (() => { const d = document.querySelector('#dropOverlay'); if (d) d.hidden = false; return true; })()
  `);
  await sleep(600);
  await shot('ui-drop.png');

  // 跑一次真实批量截图，截过程中与完成态
  await win.webContents.executeJavaScript(`
    (() => {
      const d = document.querySelector('#dropOverlay'); if (d) d.hidden = true;
      document.querySelector('#btnRun').click();
      return true;
    })()
  `);
  await sleep(1800);
  await shot('ui-running.png');
  for (let i = 0; i < 120; i++) {
    const done = await win.webContents.executeJavaScript(`
      (() => ({ txt: (document.querySelector('#runText')||{}).textContent, bar: (document.querySelector('#progressText')||{}).textContent }))()
    `);
    if (/截图|重/.test(done.txt || '') && !/停止中/.test(done.txt || '')) { console.log('run state', JSON.stringify(done)); }
    const fin = await win.webContents.executeJavaScript(`(() => (document.querySelector('#progressBar')||{}).style.width || '')()`);
    if (fin && parseFloat(fin) >= 100) { console.log('progress 100%'); break; }
    await sleep(500);
  }
  await sleep(800);
  await shot('ui-done.png');

  proc.kill();
  app.quit();
}).catch(e => { console.error(e); app.quit(); });
