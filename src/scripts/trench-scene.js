// three.js 海溝場景：程序化岩壁、海面光束、海雪、氣泡、發光生物、潛水燈與聲納光波
// 所有可調數值來自 src/data/scene.json；這個模組只負責繪製，捲動與輸入由 home.js 決定
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  FogExp2,
  HemisphereLight,
  ACESFilmicToneMapping,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  SpotLight,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from 'three';

// ---- 雜訊：用固定種子的 value noise 長出岩壁 ----
function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function valueNoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y) {
  let f = 0, amp = 0.5, fr = 1;
  for (let i = 0; i < 5; i++) { f += amp * valueNoise(x * fr, y * fr); fr *= 2.03; amp *= 0.5; }
  return f;
}
const clamp01 = (v) => Math.min(1, Math.max(0, v));
function smooth(t, a, b) { const k = clamp01((t - a) / (b - a)); return k * k * (3 - 2 * k); }

// 畫布產生的小貼圖（光束、氣泡、光點），不需要外部圖片
function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
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
  const renderer = new WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
  let maxRatio = mobile ? cfg.performance.mobileMaxPixelRatio : cfg.performance.maxPixelRatio;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxRatio));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = cfg.light.exposure;

  const scene = new Scene();
  const camera = new PerspectiveCamera(cfg.camera.fov, window.innerWidth / window.innerHeight, 0.1, 220);
  camera.position.set(0, 0, 8);
  scene.add(camera);
  const fog = new FogExp2(new Color(cfg.depthBands[0].water), cfg.depthBands[0].fog);
  scene.fog = fog;

  const T = cfg.trench;
  const TOP = T.top, BOTTOM = T.bottom, DESCENT = cfg.camera.descent;
  // 海溝半寬：越深越窄
  const halfWidth = (y) => {
    const k = clamp01((TOP - y) / (TOP - BOTTOM));
    return T.halfWidthTop - (T.halfWidthTop - T.halfWidthBottom) * k;
  };

  // ---- 岩石材質，加上聲納光波（在 shader 裡依世界座標畫出擴散的光環）----
  const sonar = {
    origin: { value: new Vector3() },
    originView: { value: new Vector3() },
    radius: { value: -100 },
    strength: { value: 0 },
    color: { value: new Color(cfg.sonar.color) },
    width: { value: cfg.sonar.ringWidth },
  };
  const rockMat = new MeshStandardMaterial({
    color: new Color(T.rockColor),
    roughness: 1,
    metalness: 0,
    flatShading: true,
    side: DoubleSide,
  });
  rockMat.onBeforeCompile = (shader) => {
    shader.uniforms.uPingOrigin = sonar.origin;
    shader.uniforms.uPingOriginView = sonar.originView;
    shader.uniforms.uPingRadius = sonar.radius;
    shader.uniforms.uPingStrength = sonar.strength;
    shader.uniforms.uPingColor = sonar.color;
    shader.uniforms.uPingWidth = sonar.width;
    shader.vertexShader = 'varying vec3 vSonarWorld;\n' + shader.vertexShader.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\n  vSonarWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;'
    );
    shader.fragmentShader = [
      'varying vec3 vSonarWorld;',
      'uniform vec3 uPingOrigin;',
      'uniform vec3 uPingOriginView;',
      'uniform float uPingRadius;',
      'uniform float uPingStrength;',
      'uniform vec3 uPingColor;',
      'uniform float uPingWidth;',
      shader.fragmentShader,
    ].join('\n').replace(
      '#include <opaque_fragment>',
      `#include <opaque_fragment>
      {
        float d = distance(vSonarWorld, uPingOrigin);
        float x = uPingRadius - d;
        float front = exp(-abs(x) / uPingWidth);
        float wake = x > 0.0 ? exp(-x / (uPingWidth * 7.0)) * 0.3 : 0.0;
        vec3 toOrigin = normalize(uPingOriginView + vViewPosition);
        float facing = 0.25 + 0.75 * max(dot(normal, toOrigin), 0.0);
        gl_FragColor.rgb += uPingColor * (front + wake) * facing * uPingStrength;
      }`
    );
  };

  // 可選的岩石貼圖（scene.json textures.rockMap），核准背景素材後才會用到
  if (cfg.textures && cfg.textures.rockMap) {
    new TextureLoader().load(cfg.textures.rockMap, (tex) => {
      tex.colorSpace = SRGBColorSpace;
      tex.wrapS = tex.wrapT = RepeatWrapping;
      tex.repeat.set(cfg.textures.rockRepeat[0], cfg.textures.rockRepeat[1]);
      rockMat.map = tex;
      rockMat.needsUpdate = true;
    });
  }

  function makeWall(side) {
    const zLen = 120, yLen = TOP - BOTTOM;
    const geo = new PlaneGeometry(zLen, yLen, T.wallSegments[0], T.wallSegments[1]);
    const pos = geo.attributes.position;
    const off = side > 0 ? T.seed : 0;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i), v = pos.getY(i);
      const z = u - 45;
      const y = v + (TOP + BOTTOM) / 2;
      const n = fbm(u * 0.06 + off, y * 0.05);
      const ridge = Math.abs(fbm(u * 0.16 + 10, y * 0.13 + (side > 0 ? 7 : 0)) - 0.5) * 2;
      const x = side * (halfWidth(y) + (n - 0.5) * 10 + ridge * 2.8 + Math.max(0, -z - 45) * 0.12);
      pos.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
    return new Mesh(geo, rockMat);
  }
  scene.add(makeWall(-1));
  scene.add(makeWall(1));

  {
    const geo = new PlaneGeometry(60, 120, T.floorSegments[0], T.floorSegments[1]);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i), v = pos.getY(i);
      pos.setXYZ(i, u, BOTTOM + 10 + fbm(u * 0.12, v * 0.12) * 7 + Math.abs(u) * 0.25, v - 45);
    }
    geo.computeVertexNormals();
    scene.add(new Mesh(geo, rockMat));
  }

  // ---- 燈光：陽光隨深度消失，最後只剩潛水燈 ----
  const L = cfg.light;
  const hemi = new HemisphereLight(new Color(L.hemiSky), new Color(L.hemiGround), L.hemiIntensity);
  scene.add(hemi);
  const sun = new DirectionalLight(new Color(L.sunColor), L.sunIntensity);
  sun.position.set(-6, 60, 12);
  scene.add(sun);
  const torch = new SpotLight(new Color(L.torchColor), L.torchIntensityTop, L.torchDistance, L.torchAngle, L.torchPenumbra, L.torchDecay);
  camera.add(torch);
  const torchTarget = new Object3D();
  scene.add(torchTarget);
  torch.target = torchTarget;

  // ---- 貼圖 ----
  const rayTex = canvasTexture(128, 512, (g, w, h) => {
    const v = g.createLinearGradient(0, 0, 0, h);
    v.addColorStop(0, 'rgba(255,255,255,0.95)'); v.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = v; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-in';
    const hz = g.createLinearGradient(0, 0, w, 0);
    hz.addColorStop(0, 'rgba(0,0,0,0)'); hz.addColorStop(0.5, 'rgba(0,0,0,1)'); hz.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = hz; g.fillRect(0, 0, w, h);
  });
  const bubbleTex = canvasTexture(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 18, 32, 32, 30);
    r.addColorStop(0, 'rgba(255,255,255,0.05)'); r.addColorStop(0.8, 'rgba(255,255,255,0.75)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(24, 23, 5, 0, Math.PI * 2); g.fill();
  });
  const glowTex = canvasTexture(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.6)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  });

  // 海面光束
  const rays = [];
  for (let r = 0; r < cfg.rays.count; r++) {
    const mat = new MeshBasicMaterial({
      map: rayTex, color: new Color(cfg.rays.color), transparent: true, opacity: 0,
      blending: AdditiveBlending, depthWrite: false, fog: false,
    });
    const ray = new Mesh(new PlaneGeometry(2 + Math.random() * 5, 80), mat);
    ray.position.set(-14 + Math.random() * 28, -10, -18 - Math.random() * 34);
    ray.rotation.z = (Math.random() - 0.5) * 0.5;
    ray.userData = { base: cfg.rays.opacityMin + Math.random() * cfg.rays.opacityRange, phase: Math.random() * 6.28 };
    scene.add(ray);
    rays.push(ray);
  }

  // 粒子：減少動態時不產生會移動的粒子
  const P = cfg.particles;
  const count = (p) => (reduceMotion ? 0 : mobile ? p.mobile : p.desktop);

  // 海雪：緩慢下沉
  const SNOW = reduceMotion ? Math.round(P.snow.mobile / 2) : count(P.snow);
  const snowGeo = new BufferGeometry();
  const snowPos = new Float32Array(SNOW * 3);
  for (let s = 0; s < SNOW; s++) {
    snowPos[s * 3] = (Math.random() - 0.5) * 32;
    snowPos[s * 3 + 1] = BOTTOM + Math.random() * (TOP - BOTTOM);
    snowPos[s * 3 + 2] = -70 + Math.random() * 76;
  }
  snowGeo.setAttribute('position', new BufferAttribute(snowPos, 3));
  const snowMat = new PointsMaterial({ color: new Color(P.snow.color), size: P.snow.size, transparent: true, opacity: P.snow.opacity, depthWrite: false });
  scene.add(new Points(snowGeo, snowMat));

  // 氣泡：在鏡頭附近往上飄
  const BUB = count(P.bubbles);
  const bubGeo = new BufferGeometry();
  const bubPos = new Float32Array(BUB * 3);
  const bubSpd = new Float32Array(BUB), bubPh = new Float32Array(BUB);
  for (let b = 0; b < BUB; b++) {
    bubPos[b * 3] = (Math.random() - 0.5) * 24;
    bubPos[b * 3 + 1] = -30 + Math.random() * 48;
    bubPos[b * 3 + 2] = -30 + Math.random() * 34;
    bubSpd[b] = P.bubbles.speedMin + Math.random() * (P.bubbles.speedMax - P.bubbles.speedMin);
    bubPh[b] = Math.random() * 6.28;
  }
  bubGeo.setAttribute('position', new BufferAttribute(bubPos, 3));
  const bubMat = new PointsMaterial({ map: bubbleTex, color: new Color(P.bubbles.color), size: P.bubbles.size, transparent: true, opacity: 0, depthWrite: false });
  scene.add(new Points(bubGeo, bubMat));

  // 發光生物：深處才出現，緩慢明滅
  const glowGroups = [];
  const GLOW = reduceMotion ? P.glow.mobile : count(P.glow);
  P.glow.colors.forEach((col, gi) => {
    const g = new BufferGeometry();
    const p = new Float32Array(GLOW * 3);
    for (let i = 0; i < GLOW; i++) {
      const y = -40 - Math.random() * (DESCENT - 25);
      const hw = halfWidth(y) - 2;
      p[i * 3] = (Math.random() * 2 - 1) * hw;
      p[i * 3 + 1] = y;
      p[i * 3 + 2] = -40 + Math.random() * 38;
    }
    g.setAttribute('position', new BufferAttribute(p, 3));
    const m = new PointsMaterial({ map: glowTex, color: new Color(col), size: P.glow.size, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
    const pts = new Points(g, m);
    pts.userData = { phase: gi * 2.1, speed: 0.6 + gi * 0.35 };
    scene.add(pts);
    glowGroups.push(pts);
  });

  // ---- 依 u（0 海面 → 1 海溝底）取水色與霧 ----
  const bands = cfg.depthBands.map((b) => ({ ...b, color: new Color(b.water) }));
  const waterCol = new Color();
  function bandAt(u) {
    for (let i = 1; i < bands.length; i++) {
      if (u <= bands[i].u) {
        const k = (u - bands[i - 1].u) / (bands[i].u - bands[i - 1].u);
        waterCol.copy(bands[i - 1].color).lerp(bands[i].color, k);
        return { color: waterCol, fog: bands[i - 1].fog + (bands[i].fog - bands[i - 1].fog) * k };
      }
    }
    const last = bands[bands.length - 1];
    return { color: waterCol.copy(last.color), fog: last.fog };
  }

  // ---- 狀態 ----
  const state = {
    u: 0,                 // 目前鏡頭位置
    targetU: 0,
    pointer: { x: 0, y: 0.1 },   // NDC，潛水燈方向
    smooth: { x: 0, y: 0.1 },
    lightLevel: 1,        // 0 = 全黑（開場），1 = 正常
    ping: null,           // { start, speed, max, strength }
  };
  const black = new Color(0x000000);
  const clearCol = new Color();
  const dir = new Vector3();
  let camY = 0;

  function ping({ strength = cfg.sonar.strength, speed = cfg.sonar.speed, maxRadius = cfg.sonar.maxRadius } = {}) {
    // 光波起點：鏡頭前方一點，讓光環掃過兩側岩壁
    sonar.origin.value.set(camera.position.x, camera.position.y, camera.position.z - 6);
    state.ping = { start: performance.now(), speed, max: maxRadius, strength };
  }

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  }

  // 每一幀由 home.js 呼叫；dt 秒，time 秒
  function render(dt, time) {
    const instant = reduceMotion;
    const C = cfg.camera;
    state.smooth.x += (state.pointer.x - state.smooth.x) * (instant ? 1 : C.pointerFollow);
    state.smooth.y += (state.pointer.y - state.smooth.y) * (instant ? 1 : C.pointerFollow);
    state.u += (state.targetU - state.u) * (instant ? 1 : C.follow);
    const u = state.u;
    const targetY = -u * DESCENT;
    camY = targetY;

    camera.position.set(state.smooth.x * C.swayX, camY, 8);
    camera.rotation.set(-smooth(u, 0.6, 1) * C.tiltAtFloor + state.smooth.y * 0.05, -state.smooth.x * 0.07, 0);
    camera.updateMatrixWorld();

    // 潛水燈指向游標
    dir.set(state.pointer.x, state.pointer.y, 0.5).unproject(camera).sub(camera.position).normalize();
    torchTarget.position.copy(camera.position).addScaledVector(dir, 20);

    const lv = state.lightLevel;
    const band = bandAt(u);
    clearCol.copy(band.color).lerp(black, 1 - lv);
    renderer.setClearColor(clearCol);
    fog.color.copy(clearCol);
    fog.density = band.fog + (1 - lv) * 0.05;
    hemi.intensity = (L.hemiIntensity * Math.pow(1 - u, 2.4) + L.hemiFloor) * lv;
    sun.intensity = L.sunIntensity * (1 - smooth(u, 0, 0.45)) * lv;
    torch.intensity = (L.torchIntensityTop + (L.torchIntensityDeep - L.torchIntensityTop) * smooth(u, 0.06, 0.55)) * lv;

    const rayFade = (1 - smooth(u, 0, cfg.rays.fadeOutU)) * lv;
    for (const ray of rays) {
      const d = ray.userData;
      ray.material.opacity = rayFade * (d.base + (instant ? 0 : Math.sin(time * 0.6 + d.phase) * 0.05));
    }

    if (!instant) {
      const sp = snowGeo.attributes.position.array;
      for (let s = 0; s < SNOW; s++) {
        sp[s * 3 + 1] -= dt * P.snow.speed;
        if (sp[s * 3 + 1] < BOTTOM) sp[s * 3 + 1] = TOP;
      }
      snowGeo.attributes.position.needsUpdate = true;

      const bp = bubGeo.attributes.position.array;
      for (let b = 0; b < BUB; b++) {
        bp[b * 3 + 1] += dt * bubSpd[b];
        bp[b * 3] += Math.sin(time * 2 + bubPh[b]) * dt * 0.25;
        if (bp[b * 3 + 1] > camY + 18) { bp[b * 3 + 1] = camY - 30 - Math.random() * 6; bp[b * 3] = (Math.random() - 0.5) * 24; }
        if (bp[b * 3 + 1] < camY - 40) bp[b * 3 + 1] = camY - 30;
      }
      bubGeo.attributes.position.needsUpdate = true;
    }
    snowMat.opacity = P.snow.opacity * (0.3 + 0.7 * lv);
    bubMat.opacity = (P.bubbles.opacityTop + (P.bubbles.opacityDeep - P.bubbles.opacityTop) * u) * lv;

    for (const g of glowGroups) {
      const d = g.userData;
      g.material.opacity = smooth(u, P.glow.appearFromU, P.glow.fullAtU) * (0.45 + (instant ? 0 : Math.sin(time * d.speed + d.phase) * 0.3)) * lv;
      if (!instant) g.position.x = Math.sin(time * 0.1 + d.phase) * 0.8;
    }

    // 聲納光波
    if (state.ping) {
      const p = state.ping;
      const r = ((performance.now() - p.start) / 1000) * p.speed;
      if (r > p.max) {
        state.ping = null;
        sonar.strength.value = 0;
      } else {
        sonar.radius.value = r;
        sonar.strength.value = p.strength * (1 - smooth(r, p.max * 0.45, p.max));
        sonar.originView.value.copy(sonar.origin.value).applyMatrix4(camera.matrixWorldInverse);
      }
    }

    renderer.render(scene, camera);
  }

  // 低效能時降低解析度
  function lowerQuality() {
    maxRatio = 1;
    renderer.setPixelRatio(1);
    resize();
  }

  return {
    render,
    resize,
    ping,
    lowerQuality,
    setTarget(u) { state.targetU = clamp01(u); },
    jumpTo(u) { state.targetU = state.u = clamp01(u); camY = -state.u * DESCENT; },
    setPointer(x, y) { state.pointer.x = x; state.pointer.y = y; },
    setLightLevel(v) { state.lightLevel = clamp01(v); },
    get lightLevel() { return state.lightLevel; },
    dispose() { renderer.dispose(); },
  };
}
