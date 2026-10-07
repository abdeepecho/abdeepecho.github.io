// 首頁主程式：捲動下潛（水深計算）、深度計、潛水燈、聲納開場、海床獎項的燈光、舷窗、表單
import cfg from '../data/scene.json';
import { S, audio } from './site-chrome.js';
import { initInquiryForm } from './inquiry-form.js';

const root = document.documentElement;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const mobile = window.matchMedia('(max-width: 760px), (pointer: coarse)').matches;
const INTRO_KEY = 'deepecho-intro-seen';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, k) => a + (b - a) * k;
const smoothstep = (k) => k * k * (3 - 2 * k);

const canvas = document.querySelector('[data-trench]');
const veil = document.querySelector('[data-torch]');
const hud = {
  num: document.querySelector('[data-depth-num]'),
  zone: document.querySelector('[data-depth-zone]'),
  fill: document.querySelector('[data-depth-fill]'),
  dot: document.querySelector('[data-depth-dot]'),
};

// ---------------------------------------------------------------
// 水深：依各區塊在頁面上的位置（data-depth）換算目前水深
// ---------------------------------------------------------------
let anchors = [];
let maxScroll = 1;
function measureAnchors() {
  const list = [];
  const vh = window.innerHeight;
  maxScroll = Math.max(1, root.scrollHeight - vh);
  document.querySelectorAll('[data-depth]').forEach((el) => {
    const top = el.getBoundingClientRect().top + window.scrollY;
    const depth = Number(el.dataset.depth);
    const pos = el.id === 'top' ? 0 : Math.max(0, top - vh * cfg.anchorViewportRatio);
    list.push({ pos: Math.min(pos, maxScroll), depth });
  });
  list.sort((a, b) => a.depth - b.depth);
  for (let i = 1; i < list.length; i++) list[i].pos = Math.max(list[i].pos, list[i - 1].pos);
  const last = list[list.length - 1];
  if (last && last.pos < maxScroll) list.push({ pos: maxScroll, depth: last.depth });
  anchors = list;
}
function depthAtScroll(y) {
  if (!anchors.length) return 0;
  if (y <= anchors[0].pos) return anchors[0].depth;
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1], b = anchors[i];
    if (y <= b.pos) return b.pos === a.pos ? b.depth : lerp(a.depth, b.depth, (y - a.pos) / (b.pos - a.pos));
  }
  return anchors[anchors.length - 1].depth;
}
// 水深 → 場景位置 u 與該深度的暗度
const bands = cfg.depthBands;
function bandAtDepth(d) {
  for (let i = 1; i < bands.length; i++) {
    if (d <= bands[i].depth) {
      const k = (d - bands[i - 1].depth) / (bands[i].depth - bands[i - 1].depth);
      return { u: lerp(bands[i - 1].u, bands[i].u, k), darkness: lerp(bands[i - 1].darkness, bands[i].darkness, k) };
    }
  }
  const last = bands[bands.length - 1];
  return { u: last.u, darkness: last.darkness };
}
function zoneAt(d) {
  let key = cfg.zones[0].key;
  for (const z of cfg.zones) if (d >= z.from) key = z.key;
  return key;
}

// ---------------------------------------------------------------
// 場景：WebGL 不可用、低效能裝置 → 靜態漸層背景
// ---------------------------------------------------------------
let scene = null;
function lowPower() {
  const P = cfg.performance;
  const cores = navigator.hardwareConcurrency || 8;
  const mem = navigator.deviceMemory || 8;
  const saveData = navigator.connection && navigator.connection.saveData;
  return cores <= P.lowPowerCores || mem <= P.lowPowerMemoryGb || saveData;
}
function useFallback(reason) {
  if (scene) { scene.dispose(); scene = null; }
  root.classList.add('no-webgl');
  if (canvas) canvas.hidden = true;
  if (reason) console.info(`[DeepEcho] 使用靜態背景：${reason}`);
}
async function initScene() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('scene') === 'off') return useFallback('scene=off');
  if (!canvas) return useFallback('no canvas');
  if (lowPower() && params.get('scene') !== 'on') return useFallback('low power device');
  try {
    const mod = await import('./trench-scene.js');
    if (!mod.hasWebGL()) return useFallback('WebGL unavailable');
    scene = mod.createTrenchScene(canvas, cfg, { mobile, reduceMotion });
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); useFallback('context lost'); });
  } catch (err) {
    useFallback(`WebGL error: ${err && err.message}`);
  }
}

// ---------------------------------------------------------------
// 潛水燈：跟著游標；沒有游標時自動緩慢擺動
// ---------------------------------------------------------------
const pointer = { x: window.innerWidth / 2, y: window.innerHeight * 0.4, seen: false };
window.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  pointer.seen = true;
  pointer.x = e.clientX;
  pointer.y = e.clientY;
}, { passive: true });

function torchPosition(time) {
  if (pointer.seen && finePointer) return { x: pointer.x, y: pointer.y };
  const O = cfg.torchOverlay;
  const sx = reduceMotion ? 0 : Math.sin(time * O.swaySpeed[0]) * O.swayAmount[0];
  const sy = 0.05 + (reduceMotion ? 0 : Math.sin(time * O.swaySpeed[1]) * O.swayAmount[1]);
  return { x: ((sx + 1) / 2) * window.innerWidth, y: ((1 - sy) / 2) * window.innerHeight };
}

// ---------------------------------------------------------------
// 海床上的獎項：潛水燈越近越亮（--lit）
// ---------------------------------------------------------------
const finds = [...document.querySelectorAll('[data-find]')];
let findsVisible = false;
if (finds.length && 'IntersectionObserver' in window) {
  new IntersectionObserver((entries) => { findsVisible = entries.some((e) => e.isIntersecting); })
    .observe(document.querySelector('[data-finds]'));
}
function lightFinds(tx, ty) {
  if (!findsVisible) return;
  const R = (mobile ? cfg.torchOverlay.radiusMobile : cfg.torchOverlay.radius) * 1.3;
  for (const el of finds) {
    const r = el.getBoundingClientRect();
    const cx = Math.max(r.left, Math.min(tx, r.right));
    const cy = Math.max(r.top, Math.min(ty, r.bottom));
    const d = Math.hypot(tx - cx, ty - cy);
    el.style.setProperty('--lit', smoothstep(clamp01(1 - d / R)).toFixed(3));
  }
}

// ---------------------------------------------------------------
// 聲納開場：黑畫面 → 第一圈照出標誌 → 第二圈照出標語 → 燈亮、潛水燈啟動
// ---------------------------------------------------------------
const hero = document.querySelector('.hero');
const reveal = hero?.querySelector('[data-reveal]');
const rings = hero ? [...hero.querySelectorAll('.sonar-ring')] : [];
const intro = { running: false, start: 0, done: !root.classList.contains('intro-pending'), lightLevel: 1, fired: [] };

function introGeometry() {
  const art = hero.querySelector('[data-logo]').getBoundingClientRect();
  const box = reveal.getBoundingClientRect();
  const cx = art.left + art.width / 2, cy = art.top + art.height / 2;
  const zh = hero.querySelector('.wordmark-zh').getBoundingClientRect();
  const slogan = hero.querySelector('.slogan').getBoundingClientRect();
  const r1 = Math.max(art.width / 2 + 40, zh.bottom - cy + 40);
  const r2 = Math.hypot(Math.max(cx - box.left, box.right - cx), Math.max(cy - box.top, box.bottom - cy)) + 80;
  reveal.style.setProperty('--reveal-y', `${((cy - box.top) / box.height) * 100}%`);
  const heroBox = hero.getBoundingClientRect();
  hero.style.setProperty('--ring-x', `${cx - heroBox.left}px`);
  hero.style.setProperty('--ring-y', `${cy - heroBox.top}px`);
  return { r1, r2, sloganDist: slogan.top - cy, maxR: Math.hypot(window.innerWidth, window.innerHeight) };
}

function setReveal(px) { reveal?.style.setProperty('--reveal', `${Math.round(px)}px`); }

function finishIntro() {
  if (intro.done) return;
  intro.done = true;
  intro.running = false;
  intro.lightLevel = 1;
  scene?.setLightLevel(1);
  rings.forEach((r) => { r.style.opacity = '0'; });
  reveal?.style.removeProperty('--reveal');
  root.classList.remove('intro-pending', 'intro-running');
  root.classList.add('intro-done', 'intro-late');
  try { window.localStorage.setItem(INTRO_KEY, '1'); } catch { /* 儲存被封鎖 */ }
  removeSkipListeners();
}

const skipEvents = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
function onSkip(e) {
  if (e.type === 'keydown' && ['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
  finishIntro();
}
function removeSkipListeners() { skipEvents.forEach((ev) => window.removeEventListener(ev, onSkip, true)); }

function startIntro() {
  if (!hero || !reveal) return finishIntro();
  root.classList.remove('intro-pending');
  root.classList.add('intro-running');
  intro.running = true;
  intro.start = performance.now();
  intro.geo = introGeometry();
  intro.lightLevel = 0;
  scene?.setLightLevel(0);
  setReveal(0);
  skipEvents.forEach((ev) => window.addEventListener(ev, onSkip, { capture: true, passive: true }));
  hero.querySelector('[data-intro-skip]')?.addEventListener('click', finishIntro);
}

function tickIntro(now) {
  if (!intro.running) return;
  const t = now - intro.start;
  const Son = cfg.sonar;
  const g = intro.geo;
  const ringR = (startMs) => ((t - startMs) / Son.domRingMs) * g.maxR;

  Son.introPings.forEach((p, i) => {
    if (t >= p.atMs && !intro.fired[i]) {
      intro.fired[i] = true;
      scene?.ping();
      audio.ping(i === 0 ? 1 : 0.7);
    }
    const ring = rings[i];
    if (!ring) return;
    if (t >= p.atMs) {
      const r = ringR(p.atMs);
      const half = ring.offsetWidth / 2 || 1;
      ring.style.transform = `scale(${(r / half).toFixed(4)})`;
      ring.style.opacity = String(clamp01(1 - r / g.maxR) * 0.9);
    }
  });

  // 遮罩半徑跟著光環走：第一圈只到標誌，第二圈揭開全部
  const p1 = Son.introPings[0], p2 = Son.introPings[1];
  let rev = 0;
  if (t >= p1.atMs) rev = Math.min(g.r1, ringR(p1.atMs));
  if (p2 && t >= p2.atMs) {
    const r = ringR(p2.atMs);
    rev = Math.max(g.r1, Math.min(g.r2, r));
    if (r >= g.sloganDist) root.classList.add('intro-late');
  }
  setReveal(rev);

  // 燈亮
  if (t >= Son.lightsUpAtMs) {
    intro.lightLevel = smoothstep(clamp01((t - Son.lightsUpAtMs) / Son.lightsUpMs));
    scene?.setLightLevel(intro.lightLevel);
  }
  if (t >= Son.introEndMs) finishIntro();
}

// ---------------------------------------------------------------
// 舷窗：截圖輪播與點擊播放預告片
// ---------------------------------------------------------------
function initPorthole() {
  const box = document.querySelector('[data-porthole]');
  if (!box) return;
  const shots = [...box.querySelectorAll('.porthole-shot')];
  const seconds = Number(box.dataset.interval) || 6;
  box.style.setProperty('--kb', `${seconds + 1.4}s`);
  let idx = 0, timer = 0, inView = false, playing = false;
  const next = () => {
    shots[idx].classList.remove('is-active');
    idx = (idx + 1) % shots.length;
    shots[idx].classList.add('is-active');
  };
  const sync = () => {
    clearInterval(timer);
    if (inView && !document.hidden && !playing && !reduceMotion && shots.length > 1) timer = setInterval(next, seconds * 1000);
  };
  new IntersectionObserver((en) => { inView = en[0].isIntersecting; sync(); }).observe(box);
  document.addEventListener('visibilitychange', sync);

  box.querySelector('.porthole-play')?.addEventListener('click', () => {
    playing = true;
    sync();
    const iframe = document.createElement('iframe');
    iframe.className = 'porthole-video';
    iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(box.dataset.yt)}?autoplay=1`;
    iframe.title = box.dataset.title || 'YouTube';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    box.classList.add('is-playing');
    box.querySelector('.porthole-glass').appendChild(iframe);
    iframe.focus();
  });
}

// 常見問題：一次只展開一題
function initFaq() {
  document.querySelectorAll('[data-accordion]').forEach((acc) => {
    acc.addEventListener('toggle', (e) => {
      if (!e.target.open) return;
      acc.querySelectorAll('details[open]').forEach((d) => { if (d !== e.target) d.open = false; });
    }, true);
  });
}

// ---------------------------------------------------------------
// 主迴圈：分頁隱藏時暫停
// ---------------------------------------------------------------
let last = performance.now();
let raf = 0;
let lastDepth = -1, lastZone = '';
const frameTimes = [];
let slowStrikes = 0;

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  const time = now / 1000;

  tickIntro(now);

  const depth = depthAtScroll(window.scrollY);
  const band = bandAtDepth(depth);
  const progress = clamp01(window.scrollY / maxScroll);

  // 深度計
  const d = Math.round(depth);
  if (d !== lastDepth) {
    lastDepth = d;
    hud.num.textContent = d.toLocaleString('en-US');
    const zone = zoneAt(d);
    if (zone !== lastZone) {
      if (lastZone && intro.done) audio.ping(0.35);
      lastZone = zone;
      hud.zone.textContent = S[`zone.${zone}`] || zone;
    }
  }
  hud.fill.style.height = `${(progress * 100).toFixed(2)}%`;
  hud.dot.style.transform = `translateY(${(progress * hud.fill.parentElement.clientHeight).toFixed(1)}px)`;

  // 潛水燈與遮光
  const torch = torchPosition(time);
  const lightLevel = intro.done ? 1 : intro.lightLevel;
  if (veil) {
    veil.style.setProperty('--tx', `${torch.x.toFixed(1)}px`);
    veil.style.setProperty('--ty', `${torch.y.toFixed(1)}px`);
    veil.style.setProperty('--dark', (band.darkness * lightLevel).toFixed(3));
    veil.style.setProperty('--veil', scene ? '0' : (1 - lightLevel).toFixed(3));
  }
  lightFinds(torch.x, torch.y);

  if (scene) {
    scene.setTarget(band.u);
    scene.setPointer((torch.x / window.innerWidth) * 2 - 1, -((torch.y / window.innerHeight) * 2 - 1));
    scene.render(dt, time);
    watchPerformance(dt);
  }
  raf = requestAnimationFrame(frame);
}

// 低效能偵測：連續太慢就先降解析度，再慢就改用靜態背景
function watchPerformance(dt) {
  if (!intro.done) return;
  frameTimes.push(dt * 1000);
  if (frameTimes.length < cfg.performance.sampleFrames) return;
  const sorted = frameTimes.splice(0).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median > cfg.performance.slowFrameMs && !document.hidden) {
    slowStrikes += 1;
    if (slowStrikes === 1) scene.lowerQuality();
    else if (slowStrikes >= 3) useFallback(`slow frames (${median.toFixed(0)} ms)`);
  }
}

function startLoop() {
  if (raf) return;
  last = performance.now();
  raf = requestAnimationFrame(frame);
}
function stopLoop() {
  cancelAnimationFrame(raf);
  raf = 0;
}
document.addEventListener('visibilitychange', () => (document.hidden ? stopLoop() : startLoop()));

// ---------------------------------------------------------------
// 啟動
// ---------------------------------------------------------------
async function boot() {
  root.classList.add('home-ready');
  measureAnchors();
  window.addEventListener('resize', () => { measureAnchors(); scene?.resize(); });
  if ('ResizeObserver' in window) new ResizeObserver(() => measureAnchors()).observe(document.body);
  document.fonts?.ready.then(measureAnchors);

  initPorthole();
  initFaq();
  initInquiryForm(document.getElementById('inquiry'));

  const wantsIntro = root.classList.contains('intro-pending');
  await initScene();
  if (scene) {
    const b = bandAtDepth(depthAtScroll(window.scrollY));
    scene.jumpTo(b.u);
  }
  if (wantsIntro && !intro.done) startIntro();
  else finishIntro();
  startLoop();
}
boot();
