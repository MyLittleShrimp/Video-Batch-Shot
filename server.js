/**
 * 视频批量截图工具 - 本地服务
 * 依赖：Node 18+ / ffmpeg / ffprobe
 */
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');

const VERSION = '1.1.0';
const ROOT = __dirname;
const APP_DIR = path.join(ROOT, 'app');
const CACHE_DIR = path.join(os.tmpdir(), 'vshot-cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });

const VIDEO_EXT = new Set([
  '.mp4', '.mov', '.mkv', '.avi', '.wmv', '.flv', '.webm', '.m4v', '.mpg',
  '.mpeg', '.ts', '.m2ts', '.mts', '.3gp', '.3g2', '.rmvb', '.rm', '.asf',
  '.ogv', '.ogg', '.f4v', '.vob', '.divx', '.mxf', '.dv', '.m2v', '.dat'
]);

/* ---------------------------- 环境探测 ---------------------------- */
let FFMPEG = process.env.FFMPEG_PATH || '';
let FFPROBE = process.env.FFPROBE_PATH || '';

/** 优先使用安装目录自带的二进制（bin/ffmpeg.exe），其次找系统 PATH */
function findLocalBin(name) {
  const candidates = [
    path.join(ROOT, 'bin', name + '.exe'),
    path.join(ROOT, name + '.exe'),
    path.join(path.dirname(process.execPath), 'bin', name + '.exe'),
    path.join(path.dirname(process.execPath), name + '.exe')
  ];
  for (const p of candidates) {
    try { if (fs.statSync(p).isFile()) return p; } catch { }
  }
  return '';
}

function whereBin(name) {
  return new Promise((resolve) => {
    execFile('where', [name], { windowsHide: true, encoding: 'utf8' }, (err, out) => {
      if (err || !out) return resolve('');
      const first = out.split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0];
      resolve(first || '');
    });
  });
}

async function detectBin() {
  if (!FFMPEG) FFMPEG = findLocalBin('ffmpeg') || await whereBin('ffmpeg') || 'ffmpeg';
  if (!FFPROBE) {
    FFPROBE = findLocalBin('ffprobe');
    if (!FFPROBE && FFMPEG) {
      const guess = path.join(path.dirname(FFMPEG), 'ffprobe.exe');
      try { if (fs.statSync(guess).isFile()) FFPROBE = guess; } catch { }
    }
    if (!FFPROBE) FFPROBE = await whereBin('ffprobe');
  }
}

/* ---------------------------- 工具函数 ---------------------------- */
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (c) => {
      buf += c;
      if (buf.length > 8 * 1024 * 1024) reject(new Error('请求体过大'));
    });
    req.on('end', () => {
      if (!buf) return resolve({});
      try { resolve(JSON.parse(buf)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function humanSize(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
}

function safeName(n, maxLen = 150) {
  let s = n.replace(/[\\/:*?"<>|\r\n\t]/g, '_').replace(/\s+/g, ' ').trim();
  if (s.length > maxLen) s = s.slice(0, maxLen).replace(/[ _\-.()]+$/, '');
  return s || 'screenshot';
}

function uniquePath(dir, base, ext) {
  let p = path.join(dir, `${base}${ext}`);
  let i = 2;
  while (fs.existsSync(p)) {
    p = path.join(dir, `${base} (${i})${ext}`);
    i++;
    if (i > 9999) break;
  }
  return p;
}

/* ---------------------------- 视频扫描 ---------------------------- */
function walk(dir, out, depth = 0) {
  if (depth > 8) return out;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '$RECYCLE.BIN') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out, depth + 1);
    else if (e.isFile() && VIDEO_EXT.has(path.extname(e.name).toLowerCase())) out.push(full);
  }
  return out;
}

/** 没有 ffprobe 时的兜底：从 ffmpeg -i 的 stderr 里解析时长与分辨率 */
function probeByFfmpeg(file) {
  return new Promise((resolve) => {
    const empty = { duration: 0, width: 0, height: 0, codec: '', fps: '' };
    execFile(FFMPEG, ['-hide_banner', '-i', file], { windowsHide: true, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' }, (err, _stdout, stderr) => {
      const text = stderr || '';
      if (!text) return resolve(empty);
      let duration = 0;
      const dm = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (dm) duration = (+dm[1]) * 3600 + (+dm[2]) * 60 + parseFloat(dm[3]);
      let width = 0, height = 0, codec = '';
      const vline = text.split(/\r?\n/).find(l => /Stream #\d+:\d+.*: Video:/.test(l)) || '';
      const cm = vline.match(/Video:\s*([A-Za-z0-9_]+)/);
      if (cm) codec = cm[1].toLowerCase();
      const rm = vline.match(/(\d{2,5})x(\d{2,5})/);
      if (rm) { width = +rm[1]; height = +rm[2]; }
      const fm = vline.match(/(\d+(?:\.\d+)?)\s*fps/);
      resolve({ duration, width, height, codec, fps: fm ? fm[1] : '' });
    });
  });
}

async function probe(file) {
  if (!FFPROBE) return probeByFfmpeg(file);
  return new Promise((resolve) => {
    const args = [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'format=duration:stream=width,height,codec_name,r_frame_rate',
      '-of', 'json', file
    ];
    execFile(FFPROBE, args, { windowsHide: true, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' }, (err, stdout) => {
      if (err) return resolve({ duration: 0, width: 0, height: 0, codec: '', fps: '' });
      try {
        const j = JSON.parse(stdout || '{}');
        const s = (j.streams && j.streams[0]) || {};
        resolve({
          duration: parseFloat((j.format && j.format.duration) || 0) || 0,
          width: s.width || 0,
          height: s.height || 0,
          codec: s.codec_name || '',
          fps: s.r_frame_rate || ''
        });
      } catch {
        resolve({ duration: 0, width: 0, height: 0, codec: '', fps: '' });
      }
    });
  });
}

/* ---------------------------- 截图核心 ---------------------------- */
function luminance(file) {
  return new Promise((resolve) => {
    const args = [
      '-hide_banner', '-loglevel', 'error', '-i', file,
      '-vf', 'scale=32:32,format=gray', '-f', 'rawvideo', '-'
    ];
    execFile(FFMPEG, args, { windowsHide: true, encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err || !stdout || !stdout.length) return resolve(255);
      let sum = 0;
      for (let i = 0; i < stdout.length; i++) sum += stdout[i];
      resolve(sum / stdout.length);
    });
  });
}

function buildScaleFilter(maxEdge) {
  if (!maxEdge) return null;
  const e = Math.round(maxEdge);
  return `scale='if(gte(iw,ih),min(iw\\,${e}),-2)':'if(gte(iw,ih),-2,min(ih\\,${e}))'`;
}

const IMAGE_EXT = /\.(jpe?g|png|webp|bmp|tiff?)$/i;

function grabFrame({ file, time, outPath, format = 'jpg', quality = 92, maxEdge = 0 }) {
  return new Promise((resolve, reject) => {
    const vf = buildScaleFilter(maxEdge);
    const args = ['-hide_banner', '-loglevel', 'error'];
    // 静态图片输入不支持 -ss 定位，直接取图
    if (!IMAGE_EXT.test(file)) args.push('-ss', String(Math.max(0, time)));
    args.push('-i', file, '-frames:v', '1');
    if (vf) args.push('-vf', vf);
    if (format === 'png') {
      args.push('-compression_level', '6', '-pred', 'mixed');
    } else {
      const q = Math.round(clamp(31 - (quality / 100) * 29, 2, 31));
      args.push('-q:v', String(q));
    }
    args.push('-y', outPath);
    const t0 = Date.now();
    execFile(FFMPEG, args, { windowsHide: true, encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 }, async (err) => {
      if (err) return reject(new Error('ffmpeg 提取失败: ' + String(err.message).split('\n')[0]));
      try {
        const st = await fsp.stat(outPath);
        if (!st.size) return reject(new Error('输出文件为空'));
        resolve({ path: outPath, size: st.size, ms: Date.now() - t0 });
      } catch (e) { reject(e); }
    });
  });
}

/** 计算候选时间点，用于自动跳过黑场 */
function candidateTimes(t, duration) {
  const list = [t];
  if (duration > 0.4) {
    for (const p of [0.15, 0.85, 0.35, 0.65, 0.05, 0.95, 0.25, 0.75]) {
      list.push(duration * p);
    }
  }
  const seen = new Set();
  return list
    .map(x => clamp(x, 0, Math.max(0, duration - 0.06)))
    .filter(x => {
      const k = x.toFixed(2);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

function resolveTime(opts, duration) {
  const d = duration > 0 ? duration : 0;
  const mode = opts.mode || 'middle';
  let t;
  if (opts.time != null && !Number.isNaN(opts.time)) t = Number(opts.time);
  else if (mode === 'first') t = 0.05;
  else if (mode === 'seconds') t = Number(opts.seconds) || 0;
  else if (mode === 'percent') t = d * (clamp(Number(opts.percent) || 50, 0, 100) / 100);
  else t = d / 2;
  if (d > 0) t = clamp(t, 0, Math.max(0, d - 0.06));
  return t;
}

/** 生成缓存预览图，返回 id */
async function makePreview(file, time, duration) {
  const hash = crypto.createHash('md5')
    .update(`${file}|${time.toFixed(3)}|${Date.now()}`)
    .digest('hex').slice(0, 16);
  const out = path.join(CACHE_DIR, hash + '.jpg');
  await grabFrame({ file, time, outPath: out, format: 'jpg', quality: 80, maxEdge: 640 });
  return { id: hash, url: `/cache/${hash}.jpg` };
}

/* ---------------------------- 原生对话框 ---------------------------- */
function psDialog(kind, opts = {}) {
  return new Promise((resolve) => {
    const tmp = path.join(os.tmpdir(), `vshot-dlg-${Date.now()}.txt`);
    const filter = '视频文件|*.mp4;*.mov;*.mkv;*.avi;*.wmv;*.flv;*.webm;*.m4v;*.mpg;*.mpeg;*.ts;*.m2ts;*.mts;*.3gp;*.rmvb;*.rm;*.asf;*.ogv;*.f4v;*.vob;*.mxf|所有文件|*.*';
    let script;
    if (kind === 'folder') {
      script = `
Add-Type -AssemblyName System.Windows.Forms | Out-Null
$d = New-Object System.Windows.Forms.FolderBrowserDialog
$d.Description = '选择视频所在文件夹（可含子文件夹）'
$d.ShowNewFolderButton = $true
if ($d.ShowDialog() -eq 'OK') { [System.IO.File]::WriteAllText('${tmp.replace(/\\/g, '\\\\')}', $d.SelectedPath, [System.Text.Encoding]::UTF8) }
`;
    } else if (kind === 'save') {
      script = `
Add-Type -AssemblyName System.Windows.Forms | Out-Null
$d = New-Object System.Windows.Forms.FolderBrowserDialog
$d.Description = '选择截图导出目录'
$d.ShowNewFolderButton = $true
if ($d.ShowDialog() -eq 'OK') { [System.IO.File]::WriteAllText('${tmp.replace(/\\/g, '\\\\')}', $d.SelectedPath, [System.Text.Encoding]::UTF8) }
`;
    } else {
      script = `
Add-Type -AssemblyName System.Windows.Forms | Out-Null
$d = New-Object System.Windows.Forms.OpenFileDialog
$d.Title = '选择视频文件（可多选）'
$d.Multiselect = $true
$d.Filter = '${filter}'
if ($d.ShowDialog() -eq 'OK') { [System.IO.File]::WriteAllText('${tmp.replace(/\\/g, '\\\\')}', ($d.FileNames -join [char]10), [System.Text.Encoding]::UTF8) }
`;
    }
    const b64 = Buffer.from(script, 'utf16le').toString('base64');
    const child = spawn('powershell', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', b64], {
      windowsHide: false, stdio: 'ignore', detached: false
    });
    child.on('exit', async () => {
      let text = '';
      try { text = await fsp.readFile(tmp, 'utf8'); await fsp.unlink(tmp); } catch { }
      const items = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      resolve(kind === 'files' ? items : (items[0] || ''));
    });
    child.on('error', () => resolve(kind === 'files' ? [] : ''));
  });
}

/* ---------------------------- HTTP 服务 ---------------------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

async function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  const full = path.join(APP_DIR, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!full.startsWith(APP_DIR)) { res.writeHead(403); return res.end('forbidden'); }
  try {
    const st = await fsp.stat(full);
    if (!st.isFile()) throw new Error('not file');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(full).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
  }
}

async function serveCache(res, name) {
  const file = path.join(CACHE_DIR, path.basename(name));
  try {
    const st = await fsp.stat(file);
    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Content-Length': st.size,
      'Cache-Control': 'public, max-age=600'
    });
    fs.createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404); res.end();
  }
}

const jobs = new Map();

async function handleApi(req, res, urlPath) {
  const u = new URL(urlPath, 'http://localhost');
  const route = u.pathname;

  if (route === '/api/ping') return json(res, 200, { ok: true, vshot: true, version: VERSION, ffmpeg: FFMPEG, ffprobe: FFPROBE || '' });

  if (route === '/api/dialog/folder' || route === '/api/dialog/files' || route === '/api/dialog/save') {
    const kind = route.endsWith('files') ? 'files' : route.endsWith('save') ? 'save' : 'folder';
    const r = await psDialog(kind);
    return json(res, 200, { ok: true, path: kind === 'files' ? '' : r, files: kind === 'files' ? r : [] });
  }

  if (route === '/api/scan' && req.method === 'POST') {
    const body = await readBody(req);
    const inputs = Array.isArray(body.paths) ? body.paths : [];
    const recursive = body.recursive !== false;
    const files = [];
    for (const p of inputs) {
      try {
        const st = await fsp.stat(p);
        if (st.isDirectory()) {
          const found = walk(p, []);
          files.push(...found);
        } else if (VIDEO_EXT.has(path.extname(p).toLowerCase())) {
          files.push(p);
        }
      } catch { }
    }
    const uniq = [...new Set(files.map(f => path.resolve(f)))];
    // 并发探测元数据
    const results = [];
    const CONC = 4;
    let idx = 0;
    await Promise.all(Array.from({ length: Math.min(CONC, uniq.length) }, async () => {
      while (idx < uniq.length) {
        const my = idx++;
        const f = uniq[my];
        let st = null;
        try { st = await fsp.stat(f); } catch { }
        const info = await probe(f);
        results[my] = {
          path: f,
          name: path.basename(f),
          dir: path.dirname(f),
          size: st ? st.size : 0,
          sizeText: humanSize(st ? st.size : 0),
          ...info
        };
      }
    }));
    return json(res, 200, { ok: true, files: results.filter(Boolean), skipped: files.length - uniq.length });
  }

  if (route === '/api/thumb' && req.method === 'POST') {
    const b = await readBody(req);
    if (!b.path) return json(res, 400, { ok: false, msg: '缺少路径' });
    const info = b.duration ? { duration: b.duration } : await probe(b.path);
    const t = resolveTime(b, info.duration || 0);
    try {
      const pv = await makePreview(b.path, t, info.duration || 0);
      return json(res, 200, { ok: true, time: t, ...pv });
    } catch (e) {
      return json(res, 500, { ok: false, msg: e.message });
    }
  }

  if (route === '/api/preview' && req.method === 'POST') {
    const b = await readBody(req);
    const t = resolveTime(b, b.duration || 0);
    const pv = await makePreview(b.path, t, b.duration || 0);
    // 额外给一张大图供弹窗预览
    const bigHash = crypto.createHash('md5').update(`${b.path}|big|${t.toFixed(3)}|${Date.now()}`).digest('hex').slice(0, 16);
    const big = path.join(CACHE_DIR, bigHash + '.jpg');
    await grabFrame({ file: b.path, time: t, outPath: big, format: 'jpg', quality: 88, maxEdge: 1600 });
    return json(res, 200, { ok: true, time: t, url: pv.url, bigUrl: `/cache/${bigHash}.jpg` });
  }

  if (route === '/api/batch' && req.method === 'POST') {
    const b = await readBody(req);
    const items = Array.isArray(b.items) ? b.items : [];
    const cfg = b.config || {};
    const outDir = path.resolve(cfg.outDir || path.join(path.dirname(items[0]?.path || ROOT), '截图导出'));
    const concurrency = clamp(Number(cfg.concurrency) || 3, 1, 8);
    const jobId = crypto.randomBytes(6).toString('hex');
    const job = { cancelled: false };
    jobs.set(jobId, job);

    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no'
    });
    const send = (o) => { if (!res.writableEnded) res.write(JSON.stringify(o) + '\n'); };

    try { await fsp.mkdir(outDir, { recursive: true }); }
    catch (e) {
      send({ type: 'fatal', msg: '无法创建输出目录：' + e.message });
      return res.end();
    }

    const t0 = Date.now();
    send({ type: 'start', jobId, total: items.length, outDir });
    let ok = 0, fail = 0, skipped = 0;
    let cursor = 0;

    const worker = async () => {
      while (cursor < items.length) {
        const i = cursor++;
        if (job.cancelled) { skipped++; continue; }
        const it = items[i];
        const started = Date.now();
        try {
          const duration = it.duration || (await probe(it.path)).duration || 0;
          const rawName = path.basename(it.path, path.extname(it.path));
          // 预留目录长度，避免超过 Windows 路径上限
          const room = Math.min(150, Math.max(40, 240 - outDir.length));
          const base = safeName(rawName, room);
          const fmt = (cfg.format || 'jpg').toLowerCase() === 'png' ? 'png' : 'jpg';
          const ext = '.' + fmt;
          const maxEdge = Number(cfg.maxEdge) || 0;
          const useAuto = it.time == null;
          const target = resolveTime({
            mode: cfg.mode, percent: cfg.percent, seconds: cfg.seconds, time: it.time
          }, duration);
          const outPath = cfg.overwrite === false
            ? uniquePath(outDir, base, ext)
            : path.join(outDir, base + ext);
          if (cfg.overwrite !== false) {
            try { await fsp.unlink(outPath); } catch { }
          }

          let candidates = useAuto && cfg.avoidBlack !== false ? candidateTimes(target, duration) : [target];
          let done = null, lastErr = null, usedT = target, attempts = 0;
          for (const ct of candidates) {
            if (job.cancelled) break;
            attempts++;
            const tmpOut = outPath.replace(new RegExp(ext.replace('.', '\\.') + '$'), `__t${attempts}${ext}`);
            try {
              const r = await grabFrame({ file: it.path, time: ct, outPath: tmpOut, format: fmt, quality: cfg.quality, maxEdge });
              const lum = await luminance(tmpOut);
              if (cfg.avoidBlack !== false && lum < 10 && candidates.length > 1) {
                done = { path: tmpOut, size: r.size, ms: r.ms, lum };
                usedT = ct;
                continue; // 黑场，继续找
              }
              done = { path: tmpOut, size: r.size, ms: r.ms, lum };
              usedT = ct;
              break;
            } catch (e) { lastErr = e; }
          }
          if (!done) throw lastErr || new Error('未取得可用画面');

          await fsp.rename(done.path, outPath);
          let preview = null;
          try {
            const pvHash = crypto.createHash('md5').update(outPath + Date.now()).digest('hex').slice(0, 16);
            const pvFile = path.join(CACHE_DIR, pvHash + '.jpg');
            await grabFrame({ file: outPath, time: 0, outPath: pvFile, format: 'jpg', quality: 78, maxEdge: 520 });
            preview = `/cache/${pvHash}.jpg`;
          } catch { }

          ok++;
          send({
            type: 'item', index: i, status: 'ok', path: it.path,
            out: outPath, outName: path.basename(outPath), preview,
            time: usedT, duration, attempts, lum: Math.round(done.lum), ms: Date.now() - started
          });
        } catch (e) {
          fail++;
          send({ type: 'item', index: i, status: 'error', path: it.path, msg: e.message, ms: Date.now() - started });
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, worker));
    jobs.delete(jobId);
    send({ type: 'done', ok, fail, skipped, cancelled: job.cancelled, outDir, elapsed: Date.now() - t0 });
    res.end();
    return;
  }

  if (route === '/api/batch/cancel' && req.method === 'POST') {
    const b = await readBody(req);
    const job = jobs.get(b.jobId);
    if (job) job.cancelled = true;
    return json(res, 200, { ok: !!job });
  }

  if (route === '/api/reveal' && req.method === 'POST') {
    const b = await readBody(req);
    if (!b.dir) return json(res, 400, { ok: false });
    try {
      spawn('explorer.exe', [b.dir], { detached: true, stdio: 'ignore' }).unref();
      return json(res, 200, { ok: true });
    } catch (e) { return json(res, 500, { ok: false, msg: e.message }); }
  }

  if (route === '/api/openfile' && req.method === 'POST') {
    const b = await readBody(req);
    if (!b.file) return json(res, 400, { ok: false });
    try {
      spawn('cmd', ['/c', 'start', '', b.file], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      return json(res, 200, { ok: true });
    } catch { return json(res, 500, { ok: false }); }
  }

  return json(res, 404, { ok: false, msg: '未知接口' });
}

function openBrowser(url) {
  const { exec } = require('child_process');
  exec(`start "" "${url}"`, { shell: 'cmd.exe' });
}

/** 检查端口上是否已经是本工具在运行（避免重复启动多个实例） */
function pingPort(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/ping', timeout: 1500 }, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try { resolve(!!JSON.parse(b).vshot); } catch { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function main() {
  await detectBin();
  const PORT = Number(process.env.PORT) || 7788;

  // 已有实例在跑：直接把界面调出来，不再重复起服务
  if (process.env.NO_OPEN !== '1' && await pingPort(PORT)) {
    openBrowser(`http://127.0.0.1:${PORT}`);
    console.log('工具已在运行，已为你打开界面。');
    setTimeout(() => process.exit(0), 800);
    return;
  }

  const server = http.createServer((req, res) => {
    const urlPath = req.url || '/';
    if (urlPath.startsWith('/cache/')) return serveCache(res, urlPath.slice(7).split('?')[0]);
    if (urlPath.startsWith('/api/')) {
      handleApi(req, res, urlPath).catch((e) => {
        try { json(res, 500, { ok: false, msg: e.message }); } catch { }
      });
      return;
    }
    serveStatic(req, res, urlPath);
  });

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.log(`端口 ${PORT} 已被占用，换用 ${PORT + 1} 启动`);
      server.listen(PORT + 1, '127.0.0.1');
    } else {
      console.error(e);
    }
  });

  server.listen(PORT, '127.0.0.1', async () => {
    const addr = server.address();
    const url = `http://127.0.0.1:${addr.port}`;
    console.log('==============================================');
    console.log('  视频批量截图工具已启动');
    console.log('  地址: ' + url);
    console.log('  ffmpeg: ' + (FFMPEG || '未找到'));
    console.log('  ffprobe: ' + (FFPROBE || '未安装（已启用内置解析）'));
    console.log('  关闭此窗口即退出工具');
    console.log('==============================================');
    if (process.env.NO_OPEN !== '1') openBrowser(url);
  });
}

main();
