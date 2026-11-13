/* 视频批量截图工具 - 前端逻辑 */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const state = {
  files: [],
  seq: 0,
  running: false,
  jobId: null,
  outDir: '',
  outDirManual: false,
  config: {
    mode: 'middle',
    percent: 50,
    seconds: 1.5,
    format: 'jpg',
    quality: 92,
    maxEdge: 0,
    avoidBlack: true,
    concurrency: 3,
    overwrite: true
  }
};

const cards = new Map();

/* ---------------- 基础工具 ---------------- */
function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

function toast(msg, kind = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast show ' + kind;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.className = 'toast ' + kind; }, 2600);
}

async function api(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  return r.json();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ---------------- 环境 ---------------- */
async function initEnv() {
  try {
    const r = await fetch('/api/ping');
    const j = await r.json();
    const ok = j.ffmpeg && j.ffmpeg !== 'ffmpeg';
    $('#envInfo').textContent = ok ? 'ffmpeg 已就绪 · 本地解码，不上传文件' : '警告：未检测到 ffmpeg，请先安装并加入 PATH';
  } catch {
    $('#envInfo').textContent = '本地服务连接失败';
  }
}

/* ---------------- 导入 ---------------- */
async function importPaths(paths) {
  if (!paths || !paths.length) return;
  const clean = paths.map(p => p.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  if (!clean.length) return;

  const btnText = $('#envInfo').textContent;
  $('#envInfo').textContent = `正在扫描 ${clean.length} 个路径…`;
  try {
    const r = await api('/api/scan', { paths: clean, recursive: true });
    if (!r.ok) throw new Error(r.msg || '扫描失败');
    if (!r.files.length) {
      toast('没有找到可识别的视频文件', 'err');
      $('#envInfo').textContent = btnText;
      return;
    }
    const exist = new Set(state.files.map(f => f.path));
    let added = 0;
    for (const f of r.files) {
      if (exist.has(f.path)) continue;
      state.files.push({
        id: ++state.seq,
        ...f,
        sel: true,
        status: 'idle',
        preview: null,
        out: null,
        err: null,
        customTime: null,
        pending: false
      });
      added++;
    }
    if (!state.outDirManual) computeOutDir();
    syncGrid();
    updateStats();
    queueThumbs();
    $('#envInfo').textContent = `已导入 ${state.files.length} 个视频` + (added < r.files.length ? `（跳过 ${r.files.length - added} 个重复）` : '');
    if (added) toast(`已导入 ${added} 个视频`, 'ok');
  } catch (e) {
    $('#envInfo').textContent = btnText;
    toast(e.message, 'err');
  }
}

function computeOutDir() {
  if (state.outDirManual) return;
  const first = state.files[0];
  if (first) {
    const p = first.dir.replace(/[\\/]+$/, '') + '\\截图导出';
    state.outDir = p;
  } else {
    state.outDir = '';
  }
  renderOutDir();
}

function renderOutDir() {
  const el = $('#outDirText');
  if (state.outDirManual) {
    el.textContent = state.outDir || '未设置';
    el.title = state.outDir || '';
  } else {
    el.textContent = state.outDir ? '自动：' + state.outDir : '自动：视频所在文件夹 / 截图导出';
    el.title = state.outDir || '';
  }
}

/* ---------------- 缩略图队列 ---------------- */
const thumbQueue = [];
let thumbRunning = 0;
const THUMB_CONC = 2;

function queueThumbs() {
  for (const f of state.files) {
    if (f.preview || f.thumbQueued || f.status === 'ok') continue;
    f.thumbQueued = true;
    thumbQueue.push(f);
  }
  pumpThumbs();
}

function pumpThumbs() {
  while (thumbRunning < THUMB_CONC && thumbQueue.length) {
    const f = thumbQueue.shift();
    thumbRunning++;
    (async () => {
      try {
        const r = await api('/api/thumb', {
          path: f.path,
          duration: f.duration,
          mode: state.config.mode,
          percent: state.config.percent,
          seconds: state.config.seconds,
          time: f.customTime
        });
        if (r.ok) {
          f.preview = r.url;
          f.thumbTime = r.time;
          updateCard(f);
        }
      } catch { }
      finally {
        f.thumbQueued = false;
        thumbRunning--;
        pumpThumbs();
      }
    })();
  }
}

function resetThumbs() {
  for (const f of state.files) {
    if (f.customTime != null) continue;
    if (f.status === 'ok') continue;
    f.preview = null;
    f.thumbQueued = false;
    updateCard(f);
  }
  thumbQueue.length = 0;
  queueThumbs();
}

/* ---------------- 渲染 ---------------- */
function syncGrid() {
  const kw = $('#search').value.trim().toLowerCase();
  const list = state.files.filter(f => !kw || f.name.toLowerCase().includes(kw));
  const grid = $('#grid');

  $('#empty').hidden = state.files.length > 0;

  const alive = new Set(list.map(f => f.id));
  for (const [id, el] of cards) {
    if (!alive.has(id)) { el.remove(); cards.delete(id); }
  }
  for (const f of list) {
    let el = cards.get(f.id);
    if (!el) { el = createCard(f); cards.set(f.id, el); }
    grid.appendChild(el);
    updateCard(f);
  }
  updateStats();
}

function createCard(f) {
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.id = f.id;
  el.innerHTML = `
    <div class="thumb">
      <div class="ph">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.5l5 2.5-5 2.5z" fill="currentColor" stroke="none"/>
        </svg>
      </div>
      <span class="badge"></span>
      <span class="res"></span>
      <div class="ovl">
        <button data-act="tune" title="调整时间点">调整</button>
        <button data-act="shot" title="按当前设置重新截图">重截</button>
      </div>
      <div class="ck"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg></div>
    </div>
    <div class="meta">
      <div class="name"></div>
      <div class="sub"></div>
      <div class="card-status" hidden></div>
    </div>`;

  el.querySelector('.name').textContent = f.name;
  el.querySelector('.name').title = f.name;

  const badge = el.querySelector('.badge');
  badge.textContent = (f.height > f.width) ? '竖屏' : '横屏';

  el.querySelector('.res').textContent = f.width ? `${f.width}×${f.height}` : '';

  const sub = el.querySelector('.sub');
  sub.innerHTML = `<span>${fmtTime(f.duration)}</span><span class="dot"></span><span>${f.sizeText || ''}</span>`;

  el.querySelector('.thumb').addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    f.sel = !f.sel;
    updateCard(f);
    updateStats();
  });

  el.querySelector('[data-act="tune"]').addEventListener('click', (e) => {
    e.stopPropagation();
    openModal(f);
  });
  el.querySelector('[data-act="shot"]').addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.running) return toast('批量任务进行中，请稍候', 'err');
    captureOne(f);
  });

  return el;
}

function updateCard(f) {
  const el = cards.get(f.id);
  if (!el) return;
  el.classList.toggle('sel', !!f.sel);
  el.classList.toggle('working', f.status === 'run');

  const thumb = el.querySelector('.thumb');
  const img = thumb.querySelector('img');
  if (f.preview) {
    if (!img) {
      const i = document.createElement('img');
      i.src = f.preview;
      i.loading = 'lazy';
      thumb.insertBefore(i, thumb.firstChild);
    } else if (img.getAttribute('src') !== f.preview) {
      img.src = f.preview;
    }
    const ph = thumb.querySelector('.ph');
    if (ph) ph.remove();
  }

  const st = el.querySelector('.card-status');
  if (f.status === 'ok') {
    st.hidden = false;
    st.className = 'card-status ok';
    const t = f.shotTime != null ? fmtTime(f.shotTime) : '';
    st.innerHTML = `<svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>已截图<span class="card-t">${t}</span>`;
    st.title = f.out || '';
  } else if (f.status === 'err') {
    st.hidden = false;
    st.className = 'card-status err';
    st.innerHTML = `截图失败`;
    st.title = f.err || '';
  } else if (f.status === 'run') {
    st.hidden = false;
    st.className = 'card-status run';
    st.innerHTML = `<span class="spin"></span>截图中…`;
  } else {
    st.hidden = true;
  }
}

function updateStats() {
  const sel = state.files.filter(f => f.sel).length;
  $('#statCount').textContent = state.files.length;
  $('#statDone').textContent = state.files.filter(f => f.status === 'ok').length;
  $('#btnRun').disabled = state.running || sel === 0;
  $('#runText').textContent = state.running
    ? '正在截图…'
    : (sel && sel !== state.files.length ? `开始截图（${sel} 个）` : '开始批量截图');
}

/* ---------------- 设置面板 ---------------- */
function bindSettings() {
  const seg = $('#modeSeg');
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    $$('button', seg).forEach(x => x.classList.toggle('active', x === b));
    state.config.mode = b.dataset.mode;
    $('#fieldPercent').hidden = state.config.mode !== 'percent';
    $('#fieldSeconds').hidden = state.config.mode !== 'seconds';
    const hints = {
      middle: '默认取每个视频的正中间一帧，画面最具代表性。',
      first: '取视频起始位置（约 0.05 秒）的画面，适合固定开场镜头。',
      percent: '按视频总时长的百分比取帧，长视频也能落在同一节奏点上。',
      seconds: '每个视频都取同一时间点，适合镜头节奏一致的素材。'
    };
    $('#modeHint').textContent = hints[state.config.mode];
    debouncedReset();
  });

  $('#percent').addEventListener('input', (e) => {
    state.config.percent = +e.target.value;
    $('#percentVal').textContent = e.target.value;
    debouncedReset();
  });
  $('#seconds').addEventListener('input', (e) => {
    state.config.seconds = +e.target.value || 0;
    debouncedReset();
  });

  const fmtSeg = $('#fmtSeg');
  fmtSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    $$('button', fmtSeg).forEach(x => x.classList.toggle('active', x === b));
    state.config.format = b.dataset.fmt;
    $('#fieldQuality').hidden = state.config.format !== 'jpg';
  });

  $('#quality').addEventListener('input', (e) => {
    state.config.quality = +e.target.value;
    $('#qualityVal').textContent = e.target.value;
  });
  $('#maxEdge').addEventListener('change', (e) => { state.config.maxEdge = +e.target.value; });
  $('#avoidBlack').addEventListener('change', (e) => { state.config.avoidBlack = e.target.checked; });
  $('#overwrite').addEventListener('change', (e) => { state.config.overwrite = e.target.value === '1'; });
  $('#concurrency').addEventListener('input', (e) => {
    state.config.concurrency = +e.target.value;
    $('#concVal').textContent = e.target.value;
  });
}

let resetTimer = null;
function debouncedReset() {
  clearTimeout(resetTimer);
  resetTimer = setTimeout(() => resetThumbs(), 500);
}

/* ---------------- 导入交互 ---------------- */
function bindImports() {
  const pickFolder = async () => {
    const r = await api('/api/dialog/folder');
    if (r.path) importPaths([r.path]);
  };
  const pickFiles = async () => {
    const r = await api('/api/dialog/files');
    if (r.files && r.files.length) importPaths(r.files);
  };

  $('#btnFolder').addEventListener('click', pickFolder);
  $('#btnFiles').addEventListener('click', pickFiles);
  $('#btnFolder2').addEventListener('click', pickFolder);
  $('#btnFiles2').addEventListener('click', pickFiles);

  $('#pathInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      importPaths([e.target.value]);
      e.target.value = '';
    }
  });

  $('#btnOutDir').addEventListener('click', async () => {
    const r = await api('/api/dialog/save');
    if (r.path) {
      state.outDir = r.path;
      state.outDirManual = true;
      renderOutDir();
    }
  });

  $('#search').addEventListener('input', () => syncGrid());

  $('#btnAll').addEventListener('click', () => {
    state.files.forEach(f => f.sel = true);
    syncGrid();
  });
  $('#btnNone').addEventListener('click', () => {
    state.files.forEach(f => f.sel = false);
    syncGrid();
  });
  $('#btnClear').addEventListener('click', () => {
    if (state.running) return toast('任务进行中，无法清空', 'err');
    state.files = [];
    state.outDirManual = false;
    state.outDir = '';
    renderOutDir();
    cards.forEach(el => el.remove());
    cards.clear();
    syncGrid();
    $('#btnReveal').hidden = true;
  });
  $('#btnReveal').addEventListener('click', () => {
    if (state.outDir) api('/api/reveal', { dir: state.outDir });
  });
}

/* ---------------- 截图执行 ---------------- */
function buildPayload(items) {
  return {
    items: items.map(f => ({
      path: f.path,
      duration: f.duration,
      time: f.customTime
    })),
    config: {
      outDir: state.outDir || undefined,
      format: state.config.format,
      quality: state.config.quality,
      maxEdge: state.config.maxEdge,
      avoidBlack: state.config.avoidBlack,
      concurrency: state.config.concurrency,
      overwrite: state.config.overwrite,
      mode: state.config.mode,
      percent: state.config.percent,
      seconds: state.config.seconds
    }
  };
}

async function streamBatch(items, onEvent) {
  const resp = await fetch('/api/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildPayload(items))
  });
  if (!resp.ok) throw new Error('服务端错误 ' + resp.status);
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      let evt;
      try { evt = JSON.parse(line); } catch { continue; }
      onEvent(evt);
    }
  }
}

async function runBatch() {
  const sel = state.files.filter(f => f.sel);
  if (!sel.length) return toast('请先选择要截图的视频', 'err');

  state.running = true;
  updateStats();
  $('#btnStop').hidden = false;
  $('#progressWrap').hidden = false;
  $('#btnReveal').hidden = true;
  sel.forEach(f => { f.status = 'idle'; f.err = null; updateCard(f); });

  const t0 = Date.now();
  let finished = 0;
  const total = sel.length;
  const bar = $('#progressBar');
  const ptext = $('#progressText');
  const ptime = $('#progressTime');
  bar.style.width = '0%';
  ptext.textContent = `0 / ${total}`;

  try {
    await streamBatch(sel, (evt) => {
      if (evt.type === 'start') {
        state.jobId = evt.jobId;
        state.outDir = evt.outDir;
        renderOutDir();
      } else if (evt.type === 'item') {
        const f = sel[evt.index];
        if (!f) return;
        if (evt.status === 'ok') {
          f.status = 'ok';
          f.out = evt.out;
          f.shotTime = evt.time;
          if (evt.preview) f.preview = evt.preview;
        } else {
          f.status = 'err';
          f.err = evt.msg;
        }
        updateCard(f);
        finished++;
        bar.style.width = `${(finished / total) * 100}%`;
        ptext.textContent = `${finished} / ${total}`;
        ptime.textContent = `${((Date.now() - t0) / 1000).toFixed(1)}s`;
        updateStats();
      } else if (evt.type === 'done') {
        const secs = (evt.elapsed / 1000).toFixed(1);
        bar.style.width = '100%';
        ptime.textContent = `${secs}s`;
        const msg = evt.fail ? `完成 ${evt.ok} 张，失败 ${evt.fail} 张（${secs}s）` : `全部完成，共 ${evt.ok} 张（${secs}s）`;
        toast(msg, evt.fail ? 'err' : 'ok');
        if (evt.ok) $('#btnReveal').hidden = false;
        $('#envInfo').textContent = `已导出到 ${evt.outDir}`;
      } else if (evt.type === 'fatal') {
        toast(evt.msg, 'err');
      }
    });
  } catch (e) {
    toast('任务中断：' + e.message, 'err');
  } finally {
    state.running = false;
    state.jobId = null;
    $('#btnStop').hidden = true;
    updateStats();
    updateStats();
  }
}

async function captureOne(f) {
  f.status = 'run';
  updateCard(f);
  try {
    await streamBatch([f], (evt) => {
      if (evt.type === 'start') {
        state.outDir = evt.outDir;
        renderOutDir();
      }
      if (evt.type === 'item') {
        if (evt.status === 'ok') {
          f.status = 'ok';
          f.out = evt.out;
          f.shotTime = evt.time;
          if (evt.preview) f.preview = evt.preview;
          toast('已导出：' + evt.outName, 'ok');
        } else {
          f.status = 'err';
          f.err = evt.msg;
          toast(evt.msg, 'err');
        }
      }
      if (evt.type === 'fatal') toast(evt.msg, 'err');
    });
  } catch (e) {
    f.status = 'err';
    f.err = e.message;
    toast(e.message, 'err');
  }
  updateCard(f);
  updateStats();
}

/* ---------------- 调整时间弹窗 ---------------- */
let modalFile = null;
let modalTime = 0;
let previewTimer = null;
let previewSeq = 0;

function openModal(f) {
  modalFile = f;
  const dur = f.duration || 1;
  modalTime = f.customTime != null ? f.customTime : currentAutoTime(f);
  $('#modalName').textContent = f.name;
  $('#modalDur').textContent = fmtTime(dur);
  $('#modalSlider').value = Math.round((modalTime / dur) * 1000);
  $('#modalTime').textContent = fmtTime(modalTime);
  $('#modal').hidden = false;
  requestPreview(true);
}

function currentAutoTime(f) {
  const d = f.duration || 0;
  const c = state.config;
  let t;
  if (c.mode === 'first') t = 0.05;
  else if (c.mode === 'seconds') t = c.seconds;
  else if (c.mode === 'percent') t = d * (c.percent / 100);
  else t = d / 2;
  return Math.max(0, Math.min(t, Math.max(0, d - 0.06)));
}

async function requestPreview(immediate) {
  if (!modalFile) return;
  const my = ++previewSeq;
  $('#previewLoading').hidden = false;
  try {
    const r = await api('/api/preview', {
      path: modalFile.path,
      duration: modalFile.duration,
      time: modalTime,
      mode: state.config.mode,
      percent: state.config.percent,
      seconds: state.config.seconds
    });
    if (my !== previewSeq || !r.ok) return;
    $('#modalImg').src = r.bigUrl;
    $('#previewLoading').hidden = true;
  } catch {
    $('#previewLoading').hidden = true;
  }
}

function bindModal() {
  $$('[data-close]').forEach(el => el.addEventListener('click', () => {
    $('#modal').hidden = true;
    modalFile = null;
  }));

  $('#modalSlider').addEventListener('input', (e) => {
    if (!modalFile) return;
    const dur = modalFile.duration || 1;
    modalTime = (e.target.value / 1000) * dur;
    $('#modalTime').textContent = fmtTime(modalTime);
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => requestPreview(false), 220);
  });

  $('#modalReset').addEventListener('click', () => {
    if (!modalFile) return;
    modalFile.customTime = null;
    const f = modalFile;
    $('#modal').hidden = true;
    modalFile = null;
    f.preview = null;
    f.thumbQueued = false;
    queueThumbs();
    updateCard(f);
    toast('已恢复自动取帧');
  });

  $('#modalUse').addEventListener('click', async () => {
    if (!modalFile) return;
    const f = modalFile;
    f.customTime = modalTime;
    $('#modal').hidden = true;
    modalFile = null;
    if (state.running) {
      toast('任务进行中，已记住时间点', 'ok');
      return;
    }
    await captureOne(f);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#modal').hidden) {
      $('#modal').hidden = true;
      modalFile = null;
    }
  });
}

/* ---------------- 启动 ---------------- */
/* ---------------------------- 拖拽导入 ---------------------------- */
function initDragDrop() {
  const overlay = $('#dropOverlay');
  const hint = $('#dropHint');
  const desktop = window.vshotDesktop;
  const isDesktop = !!(desktop && desktop.isDesktop);
  let depth = 0;

  if (!isDesktop) {
    overlay.classList.add('warn');
    hint.textContent = '当前是浏览器模式，读不到本地路径；请改用「导入文件夹」';
  }

  const hasFiles = (e) => {
    const dt = e.dataTransfer;
    return !!(dt && dt.types && Array.prototype.indexOf.call(dt.types, 'Files') >= 0);
  };

  const show = () => { overlay.hidden = false; };
  const hide = () => { depth = 0; overlay.hidden = true; };

  // 关键：拖拽默认行为必须全局拦掉，否则浏览器把拖入的文件当成导航，开一堆窗口
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (hasFiles(e) && e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }, false);

  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth++;
    show();
  }, false);

  window.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) overlay.hidden = true;
  }, false);

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    hide();
    const dt = e.dataTransfer;
    if (!dt) return;

    const files = dt.files ? Array.prototype.slice.call(dt.files) : [];

    // 桌面版：从 File 对象取回真实路径（浏览器做不到）
    if (files.length && isDesktop) {
      const paths = [];
      for (const f of files) {
        const p = desktop.getPathForFile(f);
        if (p) paths.push(p);
      }
      if (paths.length) {
        importPaths(paths);
        return;
      }
    }

    if (files.length && !isDesktop) {
      toast('浏览器读不到本地路径，请点「导入文件夹」；桌面版可直接拖拽', 'err');
      return;
    }

    // 拖进来的是文本路径，也认
    const text = (dt.getData('text/plain') || dt.getData('text/uri-list') || '').trim();
    if (text) {
      importPaths([text]);
      return;
    }

    toast('没有识别到可导入的视频', 'err');
  }, false);

  // 兜底：窗口失焦或拖出边界时收起遮罩
  window.addEventListener('blur', hide, false);
  document.addEventListener('dragend', hide, false);
}

function boot() {
  bindSettings();
  bindImports();
  bindModal();
  initDragDrop();
  initEnv();
  updateStats();

  $('#btnRun').addEventListener('click', runBatch);
  $('#btnStop').addEventListener('click', async () => {
    if (!state.jobId) return;
    await api('/api/batch/cancel', { jobId: state.jobId });
    toast('已请求停止，正在结束当前帧…');
  });
}

boot();
