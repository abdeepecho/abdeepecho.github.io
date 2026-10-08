// three.js 水中粒子層：海雪、氣泡、發光生物
// 環境（岩壁、光束）由背景照片負責；這一層是透明畫布，疊在照片上，只做照片做不到的動態
// 所有可調數值來自 src/data/scene.json
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  SRGBColorSpace,
  Scene,
  WebGLRenderer,
} from 'three';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
function smooth(t, a, b) { const k = clamp01((t - a) / (b - a)); return k * k * (3 - 2 * k); }

// 畫布產生的小貼圖，不需要外部圖片
function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

// 檢查瀏覽器能否建立 WebGL
export function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

export function createTrenchScene(canvas, cfg, { mobile = false, reduceMotion = false } = {}) {
  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
  const maxRatio = mobile ? cfg.performance.mobileMaxPixelRatio : cfg.performance.maxPixelRatio;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxRatio));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(cfg.camera.fov, window.innerWidth / window.innerHeight, 0.1, 120);
  camera.position.set(0, 0, 8);

  const DESCENT = cfg.camera.descent;
  const P = cfg.particles;
  const count = (p) => (reduceMotion ? 0 : mobile ? p.mobile : p.desktop);

  const softDot = canvasTexture(64, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, s, s);
  });
  const bubbleTex = canvasTexture(64, (g) => {
    const r = g.createRadialGradient(32, 32, 18, 32, 32, 30);
    r.addColorStop(0, 'rgba(255,255,255,0.05)'); r.addColorStop(0.8, 'rgba(255,255,255,0.7)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(24, 23, 5, 0, Math.PI * 2); g.fill();
  });

  // 海雪：緩慢下沉，分布在整段下潛路線上
  const S = P.snow;
  const SNOW = count(S);
  const snowGeo = new BufferGeometry();
  const snowPos = new Float32Array(SNOW * 3);
  for (let i = 0; i < SNOW; i++) {
    snowPos[i * 3] = (Math.random() - 0.5) * S.spreadX;
    snowPos[i * 3 + 1] = S.bottom + Math.random() * (S.top - S.bottom);
    snowPos[i * 3 + 2] = -40 + Math.random() * 46;
  }
  snowGeo.setAttribute('position', new BufferAttribute(snowPos, 3));
  const snowMat = new PointsMaterial({ map: softDot, color: new Color(S.color), size: S.size, transparent: true, opacity: S.opacity, depthWrite: false });
  scene.add(new Points(snowGeo, snowMat));

  // 氣泡：在鏡頭附近往上飄
  const B = P.bubbles;
  const BUB = count(B);
  const bubGeo = new BufferGeometry();
  const bubPos = new Float32Array(BUB * 3);
  const bubSpd = new Float32Array(BUB), bubPh = new Float32Array(BUB);
  for (let i = 0; i < BUB; i++) {
    bubPos[i * 3] = (Math.random() - 0.5) * 24;
    bubPos[i * 3 + 1] = -30 + Math.random() * 48;
    bubPos[i * 3 + 2] = -30 + Math.random() * 34;
    bubSpd[i] = B.speedMin + Math.random() * (B.speedMax - B.speedMin);
    bubPh[i] = Math.random() * 6.28;
  }
  bubGeo.setAttribute('position', new BufferAttribute(bubPos, 3));
  const bubMat = new PointsMaterial({ map: bubbleTex, color: new Color(B.color), size: B.size, transparent: true, opacity: 0, depthWrite: false });
  scene.add(new Points(bubGeo, bubMat));

  // 發光生物：深處才出現，緩慢明滅
  const G = P.glow;
  const GLOW = count(G);
  const glowGroups = G.colors.map((col, gi) => {
    const g = new BufferGeometry();
    const p = new Float32Array(GLOW * 3);
    for (let i = 0; i < GLOW; i++) {
      p[i * 3] = (Math.random() * 2 - 1) * G.spreadX;
      p[i * 3 + 1] = -40 - Math.random() * (DESCENT - 25);
      p[i * 3 + 2] = -30 + Math.random() * 30;
    }
    g.setAttribute('position', new BufferAttribute(p, 3));
    const m = new PointsMaterial({ map: softDot, color: new Color(col), size: G.size, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
    const pts = new Points(g, m);
    pts.userData = { phase: gi * 2.1, speed: 0.6 + gi * 0.35 };
    scene.add(pts);
    return pts;
  });

  const state = { u: 0, targetU: 0, pointer: { x: 0, y: 0.1 }, smooth: { x: 0, y: 0.1 }, lightLevel: 1 };
  let camY = 0;

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  }

  // 每一幀由 home.js 呼叫；dt、time 單位秒
  function render(dt, time) {
    const C = cfg.camera;
    const ease = reduceMotion ? 1 : C.pointerFollow;
    state.smooth.x += (state.pointer.x - state.smooth.x) * ease;
    state.smooth.y += (state.pointer.y - state.smooth.y) * ease;
    state.u += (state.targetU - state.u) * (reduceMotion ? 1 : C.follow);
    const u = state.u;
    camY = -u * DESCENT;
    camera.position.set(state.smooth.x * C.swayX, camY, 8);
    camera.rotation.set(state.smooth.y * 0.05, -state.smooth.x * 0.07, 0);

    const lv = state.lightLevel;
    if (!reduceMotion) {
      const sp = snowGeo.attributes.position.array;
      for (let i = 0; i < SNOW; i++) {
        sp[i * 3 + 1] -= dt * S.speed;
        if (sp[i * 3 + 1] < S.bottom) sp[i * 3 + 1] = S.top;
      }
      snowGeo.attributes.position.needsUpdate = true;

      const bp = bubGeo.attributes.position.array;
      for (let i = 0; i < BUB; i++) {
        bp[i * 3 + 1] += dt * bubSpd[i];
        bp[i * 3] += Math.sin(time * 2 + bubPh[i]) * dt * 0.25;
        if (bp[i * 3 + 1] > camY + 18) { bp[i * 3 + 1] = camY - 30 - Math.random() * 6; bp[i * 3] = (Math.random() - 0.5) * 24; }
        if (bp[i * 3 + 1] < camY - 40) bp[i * 3 + 1] = camY - 30;
      }
      bubGeo.attributes.position.needsUpdate = true;
    }
    snowMat.opacity = S.opacity * lv;
    bubMat.opacity = (B.opacityTop + (B.opacityDeep - B.opacityTop) * u) * lv;
    for (const g of glowGroups) {
      const d = g.userData;
      g.material.opacity = smooth(u, G.appearFromU, G.fullAtU) * (0.45 + Math.sin(time * d.speed + d.phase) * 0.3) * lv;
      g.position.x = Math.sin(time * 0.1 + d.phase) * 0.8;
    }
    renderer.render(scene, camera);
  }

  return {
    render,
    resize,
    lowerQuality() { renderer.setPixelRatio(1); resize(); },
    setTarget(u) { state.targetU = clamp01(u); },
    jumpTo(u) { state.targetU = state.u = clamp01(u); },
    setPointer(x, y) { state.pointer.x = x; state.pointer.y = y; },
    setLightLevel(v) { state.lightLevel = clamp01(v); },
    dispose() { renderer.dispose(); },
  };
}

