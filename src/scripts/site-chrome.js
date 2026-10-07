// 每頁共用的介面：手機選單、地球語言選單、環境音開關、導覽列目前位置
import sceneConfig from '../data/scene.json';
import { createAmbientAudio } from './ambient-audio.js';

const LANG_STORE = 'deepecho-lang'; // 與 lang-redirect.js 相同的 key

function strings() {
  const el = document.getElementById('runtime-strings');
  try { return el ? JSON.parse(el.textContent) : {}; } catch { return {}; }
}
export const S = strings();

// ---- 手機選單：aria-expanded、Esc 關閉、點連結關閉、其餘內容 inert ----
function initMenu() {
  const toggle = document.querySelector('.menu-toggle');
  const menu = toggle && document.getElementById(toggle.getAttribute('aria-controls'));
  if (!toggle || !menu) return;
  const header = document.querySelector('.site-header');
  const inertTargets = document.querySelectorAll('main, .site-footer, .skip-link, .depth-meter');
  let open = false;
  const set = (v, returnFocus) => {
    open = v;
    toggle.setAttribute('aria-expanded', String(v));
    toggle.setAttribute('aria-label', v ? S['menu.close'] : S['menu.open']);
    header?.classList.toggle('menu-open', v);
    document.documentElement.classList.toggle('no-scroll', v);
    inertTargets.forEach((el) => { el.inert = v; });
    if (!v && returnFocus) toggle.focus();
  };
  toggle.addEventListener('click', () => set(!open));
  menu.addEventListener('click', (e) => { if (open && e.target.closest('a')) set(false); });
  document.addEventListener('keydown', (e) => { if (open && e.key === 'Escape') set(false, true); });
  window.matchMedia('(min-width: 961px)').addEventListener('change', (e) => { if (e.matches && open) set(false); });
}

// ---- 導覽列目前區塊（scroll spy），切換語言時也用它保留位置 ----
function initScrollSpy() {
  const links = [...document.querySelectorAll('.nav-links a[data-section]')];
  if (!links.length || !('IntersectionObserver' in window)) return;
  const byId = new Map();
  links.forEach((a) => {
    const sec = document.getElementById(a.dataset.section);
    if (sec) byId.set(sec.id, a);
  });
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      const link = byId.get(en.target.id);
      if (!link) return;
      if (en.isIntersecting) {
        byId.forEach((l) => l.removeAttribute('aria-current'));
        link.setAttribute('aria-current', 'true');
      } else if (link.getAttribute('aria-current')) {
        link.removeAttribute('aria-current');
      }
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  byId.forEach((_, id) => io.observe(document.getElementById(id)));
}

// 目前所在區塊的 hash，讓切換語言後停在同一個深度
function currentHash() {
  if (window.location.hash) return window.location.hash;
  const active = document.querySelector('.nav-links a[aria-current="true"]');
  return active ? `#${active.dataset.section}` : '';
}

// ---- 地球語言選單（menu button 模式）----
function initLangMenu(root) {
  const toggle = root.querySelector('.lang-toggle');
  const list = root.querySelector('.lang-list');
  if (!toggle || !list) return;
  const items = () => [...list.querySelectorAll('[role="menuitemradio"]')];
  const isOpen = () => toggle.getAttribute('aria-expanded') === 'true';
  const open = (which) => {
    list.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    const all = items();
    const target = which === 'last' ? all[all.length - 1] : list.querySelector('[aria-checked="true"]') || all[0];
    target?.focus();
  };
  const close = (returnFocus) => {
    if (!isOpen()) return;
    list.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    if (returnFocus) toggle.focus();
  };
  const move = (delta) => {
    const all = items();
    const i = all.indexOf(document.activeElement);
    all[(i + delta + all.length) % all.length]?.focus();
  };
  toggle.addEventListener('click', () => (isOpen() ? close(false) : open()));
  toggle.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); open(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); open('last'); }
  });
  list.addEventListener('click', (e) => {
    const item = e.target.closest('[data-lang]');
    if (!item) return;
    e.preventDefault();
    try { window.localStorage.setItem(LANG_STORE, item.dataset.lang); } catch { /* 儲存被封鎖 */ }
    close(false);
    if (item.getAttribute('aria-checked') === 'true') return;
    window.location.href = item.getAttribute('href').split('#')[0] + currentHash();
  });
  root.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.target.closest('.lang-list')) {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Home') { e.preventDefault(); items()[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); const all = items(); all[all.length - 1].focus(); }
      else if (e.key === 'Tab') close(false);
      else if (e.key === ' ') { e.preventDefault(); document.activeElement.click(); }
    }
  });
  document.addEventListener('click', (e) => { if (isOpen() && !root.contains(e.target)) close(false); });
}

// ---- 環境音開關 ----
export const audio = createAmbientAudio(sceneConfig);
function initSoundToggle() {
  const btns = document.querySelectorAll('[data-sound-toggle]');
  const sync = (on) => btns.forEach((b) => {
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', on ? S['sound.turnOff'] : S['sound.turnOn']);
  });
  btns.forEach((b) => b.addEventListener('click', () => audio.toggle()));
  audio.onChange(sync);
  sync(audio.enabled);
}

// 導覽列：離開頂部後加上底色
function initHeaderState() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  let ticking = false;
  const update = () => { ticking = false; header.classList.toggle('is-scrolled', window.scrollY > 24); };
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  update();
}

initMenu();
initHeaderState();
initScrollSpy();
document.querySelectorAll('[data-lang-menu]').forEach(initLangMenu);
initSoundToggle();
