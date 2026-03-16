/* =========================================
   ЮМИЛИЯ — Frontend
   Talks to Cloudflare Worker API
   ========================================= */

const STORES = ['photos', 'gifs', 'videos'];
let mediaCache = { photos: [], gifs: [], videos: [] };
let lightboxItems = [];
let lightboxIndex = 0;

const API = 'https://yumiliya-worker.rkstudio.workers.dev';
const LOGIN_URL = 'https://yumiliya-worker.rkstudio.workers.dev/login';

async function init() {
  try {
    const res = await fetch(`${API}/api/me`, { credentials: 'include' });
    if (res.status === 401) { window.location.href = LOGIN_URL; return; }
  } catch (e) {
    toast('Ошибка подключения к серверу', true);
    return;
  }
  await loadAll();
  setupViews();
  setupPillTabs();
  setupDropzones();
  setupManageTabs();
  setupLightbox();
  setupLogout();
}

async function loadAll() {
  await Promise.all(STORES.map(fetchMedia));
  updateStats();
}

async function fetchMedia(type) {
  try {
    const res  = await fetch(`${API}/api/list/${type}`, { credentials: 'include' });
    if (res.status === 401) { window.location.href = LOGIN_URL; return; }
    const data = await res.json();
    mediaCache[type] = data.files || [];
    renderGallery(type);
    renderManage(type);
  } catch (e) {
    console.error('fetchMedia error', e);
    toast('Ошибка загрузки: ' + type, true);
  }
}

async function uploadFiles(type, files) {
  const fd = new FormData();
  files.forEach(f => fd.append('file', f));
  const res = await fetch(`${API}/api/upload/${type}`, { method: 'POST', body: fd, credentials: 'include' });
  if (res.status === 401) { window.location.href = LOGIN_URL; return { files: [] }; }
  const data = await res.json();
  if (!data.ok) throw new Error(data.error);
  return data;
}

async function deleteFileAPI(type, filename) {
  const res = await fetch(`${API}/api/delete/${type}/${encodeURIComponent(filename)}`, { method: 'DELETE', credentials: 'include' });
  if (res.status === 401) { window.location.href = LOGIN_URL; return; }
  const data = await res.json();
  if (!data.ok) throw new Error(data.error);
}

function setupViews() {
  document.getElementById('go-admin').addEventListener('click', () => switchView('admin'));
  document.getElementById('go-gallery').addEventListener('click', () => switchView('gallery'));
}

function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'gallery') loadAll();
}

function setupLogout() {
  const btn = document.getElementById('logout-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    await fetch(`${API}/logout`, { method: 'POST', credentials: 'include' });
    window.location.href = LOGIN_URL;
  });
}

function setupPillTabs() {
  const btns = document.querySelectorAll('.pill-btn');
  const indicator = document.getElementById('pill-indicator');
  function updateIndicator(btn) {
    const pillRect = btn.closest('.tab-pill').getBoundingClientRect();
    const btnRect  = btn.getBoundingClientRect();
    indicator.style.width = btnRect.width + 'px';
    indicator.style.left  = (btnRect.left - pillRect.left) + 'px';
  }
  requestAnimationFrame(() => {
    const active = document.querySelector('.pill-btn.active');
    if (active) updateIndicator(active);
  });
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      const media = btn.dataset.media;
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateIndicator(btn);
      document.querySelectorAll('.media-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('panel-' + media).classList.add('active');
    });
  });
}

function renderGallery(type) {
  const items  = mediaCache[type];
  const grid   = document.getElementById('grid-' + type);
  const labels = { photos: 'Ф О Т О Г Р А Ф И И', gifs: 'G I F', videos: 'В И Д Е О' };
  if (!items.length) {
    grid.innerHTML = `<div class="empty-state"><div class="sakura">🌸</div><p>${labels[type]}&ensp;П О Я В Я Т С Я&ensp;З Д Е С Ь</p></div>`;
    return;
  }
  if (type === 'videos') {
    grid.innerHTML = items.map((item, i) => `
      <div class="grid-item-video" data-index="${i}" data-type="videos">
        <video src="${API}${item.url}" preload="metadata" muted></video>
        <div class="video-play-overlay"><div class="play-circle">▶</div></div>
        <div class="item-label">${esc(item.name)}</div>
      </div>`).join('');
  } else {
    grid.innerHTML = items.map((item, i) => `
      <div class="grid-item" data-index="${i}" data-type="${type}">
        <img src="${API}${item.url}" alt="${esc(item.name)}" loading="lazy" />
        <div class="item-label">${esc(item.name)}</div>
      </div>`).join('');
  }
  grid.querySelectorAll('[data-index]').forEach(el => {
    el.addEventListener('click', () => openLightbox(type, +el.dataset.index));
  });
}

function renderManage(type) {
  const items = mediaCache[type];
  const list  = document.getElementById('manage-' + type);
  const badge = document.getElementById('badge-' + type);
  badge.textContent = items.length;
  if (!items.length) { list.innerHTML = `<div class="empty-manage">Нет загруженных файлов</div>`; return; }
  const isVidType = type === 'videos';
  list.innerHTML = items.map(item => {
    const thumb = isVidType
      ? `<video class="manage-thumb" src="${API}${item.url}" preload="metadata" muted></video>`
      : `<img class="manage-thumb" src="${API}${item.url}" alt="${esc(item.name)}" />`;
    return `<div class="manage-item">${thumb}<div class="manage-info"><div class="manage-name">${esc(item.name)}</div><div class="manage-meta">${formatBytes(item.size)} · ${item.date}</div></div><button class="delete-btn" data-name="${esc(item.name)}" data-type="${type}" title="Удалить">✕</button></div>`;
  }).join('');
  list.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteItem(btn.dataset.type, btn.dataset.name));
  });
}

function setupManageTabs() {
  document.querySelectorAll('.manage-pill').forEach(tab => {
    tab.addEventListener('click', () => {
      const type = tab.dataset.manage;
      document.querySelectorAll('.manage-pill').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.manage-list').forEach(l => l.classList.add('hidden'));
      document.getElementById('manage-' + type).classList.remove('hidden');
    });
  });
}

function setupDropzones() {
  STORES.forEach(type => {
    const dz    = document.getElementById('dz-' + type);
    const input = dz.querySelector('.file-input');
    const queue = document.getElementById('queue-' + type);
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
    dz.addEventListener('drop', async e => {
      e.preventDefault(); dz.classList.remove('dragover');
      const files = Array.from(e.dataTransfer.files).filter(f => validFile(f, type));
      files.length ? await handleFiles(files, type, queue) : toast('Неверный тип файла', true);
    });
    input.addEventListener('change', async () => {
      const files = Array.from(input.files);
      if (files.length) await handleFiles(files, type, queue);
      input.value = '';
    });
  });
}

function validFile(file, type) {
  const map = {
    photos: ['image/jpeg','image/png','image/webp','image/avif'],
    gifs:   ['image/gif','image/apng','image/webp'],
    videos: ['video/mp4','video/webm','video/ogg','video/quicktime']
  };
  return map[type].includes(file.type);
}

async function handleFiles(files, type, queueEl) {
  files.forEach(f => addQueueItem(queueEl, f));
  try {
    await uploadFiles(type, files);
    await fetchMedia(type);
    updateStats();
    toast(`Загружено: ${files.length} файл(ов)`);
  } catch (err) {
    toast('Ошибка загрузки', true);
    console.error(err);
  }
}

function addQueueItem(queueEl, file) {
  const isVid = file.type.startsWith('video');
  const el = document.createElement('div');
  el.className = 'queue-item';
  if (isVid) {
    el.innerHTML = `<div class="q-thumb-placeholder">▶</div><span class="q-name">${esc(file.name)}</span><span class="q-size">${formatBytes(file.size)}</span><span class="q-dot"></span>`;
    queueEl.prepend(el);
  } else {
    const reader = new FileReader();
    reader.onload = e => {
      el.innerHTML = `<img class="q-thumb" src="${e.target.result}" /><span class="q-name">${esc(file.name)}</span><span class="q-size">${formatBytes(file.size)}</span><span class="q-dot"></span>`;
    };
    reader.readAsDataURL(file);
    queueEl.prepend(el);
  }
  setTimeout(() => {
    el.style.transition = 'opacity 0.4s, transform 0.4s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(-8px)';
    setTimeout(() => el.remove(), 400);
  }, 4000);
}

async function deleteItem(type, filename) {
  try {
    await deleteFileAPI(type, filename);
    await fetchMedia(type);
    updateStats();
    toast('Файл удалён');
  } catch (err) {
    toast('Ошибка удаления', true);
    console.error(err);
  }
}

function setupLightbox() {
  const lb = document.getElementById('lightbox');
  document.getElementById('lb-close').addEventListener('click', closeLightbox);
  document.getElementById('lb-backdrop').addEventListener('click', closeLightbox);
  document.getElementById('lb-prev').addEventListener('click', () => navLb(-1));
  document.getElementById('lb-next').addEventListener('click', () => navLb(1));
  document.addEventListener('keydown', e => {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') navLb(-1);
    if (e.key === 'ArrowRight') navLb(1);
  });
}

function openLightbox(type, index) {
  lightboxItems = mediaCache[type];
  lightboxIndex = index;
  showLbItem();
  document.getElementById('lightbox').classList.add('open');
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.getElementById('lb-content').innerHTML = '';
}

function navLb(dir) {
  lightboxIndex = (lightboxIndex + dir + lightboxItems.length) % lightboxItems.length;
  showLbItem();
}

function showLbItem() {
  const item    = lightboxItems[lightboxIndex];
  const content = document.getElementById('lb-content');
  const caption = document.getElementById('lb-caption');
  const isVid   = item.url.match(/\.(mp4|webm|ogv|mov)(\?|$)/i) || item.name.match(/\.(mp4|webm|ogv|mov)$/i);
  content.innerHTML = isVid
    ? `<video src="${API}${item.url}" controls autoplay></video>`
    : `<img src="${API}${item.url}" alt="${esc(item.name)}" />`;
  caption.textContent = `${item.name} · ${lightboxIndex + 1} / ${lightboxItems.length}`;
}

function updateStats() {
  document.getElementById('stat-photos').textContent = mediaCache.photos.length;
  document.getElementById('stat-gifs').textContent   = mediaCache.gifs.length;
  document.getElementById('stat-videos').textContent = mediaCache.videos.length;
}

function toast(msg, isErr = false) {
  const wrap = document.getElementById('toast-wrap');
  const el   = document.createElement('div');
  el.className = 'toast' + (isErr ? ' error' : '');
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 0.3s, transform 0.3s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(12px)';
    setTimeout(() => el.remove(), 300);
  }, 2800);
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
  return (b/1048576).toFixed(1) + ' MB';
}

init().catch(console.error);
