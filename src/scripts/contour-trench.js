// 聲納等高線海溝（2D canvas）：一條往前、往下延伸的 V/U 形海溝，兩側接海床平原
// 高度 h(x,z) = floorY(z) + G(與中線的距離)；等高線 = h 等於固定值的線，
// 從左壁繞過溝底接到右壁，一層層 V 字，這是看得出「谷」的關鍵。
// 每條等高線是一整條連續路徑、固定透明度；遠處的霧、文字與圖片後方的留白、潛水燈都用整片遮罩處理，線不會斷。
// 所有可調數值在 src/data/scene.json 的 contour。

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, k) => a + (b - a) * k;
const sstep = (a, b, v) => { const k = clamp01((v - a) / (b - a)); return k * k * (3 - 2 * k); };
const hexRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgb = (c) => `rgb(${c.map((v) => Math.round(v)).join(',')})`;
const mixRgb = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));

export function createContourTrench(canvas, C, { mobile = false, reduceMotion = false } = {}) {
  const ctx = canvas.getContext('2d');
  const lc = document.createElement('canvas');   // 等高線圖層（先畫線、套遮罩，再合成到主畫布）
  const lx = lc.getContext('2d');
  const T = C.terrain, CAM = C.camera, L = C.lines;
  const colSurface = hexRgb(C.colors.surface), colAbyss = hexRgb(C.colors.abyss), colHadal = hexRgb(C.colors.hadal), colFloor = hexRgb(C.colors.floor);
  const lineRgb = hexRgb(C.colors.line).join(','), echoRgb = hexRgb(C.colors.echo).join(','), torchRgb = hexRgb(C.colors.torch).join(',');

  // ---- 地形 ----
  const floorY = (z) => -T.slope * z;
  const G = (d) =>                                   // 離中線 d 處比溝底高多少（單調遞增，才能反查）
    0.12 * Math.min(d, 2) ** 2 + T.wallHeight * sstep(1.2, T.rimDistance, d) + T.plainSlope * Math.max(0, d - T.rimDistance) + 0.01 * d;
  const U_STEP = 0.05, INV = [];
  for (let u = 0, d = 0; u <= 120; u += U_STEP) { while (G(d) < u) d += 0.01; INV.push(d); }
  const Ginv = (u) => {
    if (u <= 0) return 0;
    const i = u / U_STEP, i0 = Math.floor(i);
    if (i0 >= INV.length - 1) return INV[INV.length - 1];
    return INV[i0] + (INV[i0 + 1] - INV[i0]) * (i - i0);
  };
  const M = T.meander;
  const cx = (z) => M[0] * Math.sin(z * 0.028 + 0.6) + M[1] * Math.sin(z * 0.071 + 2.1);
  const widen = (z) => 1 + T.widthVariation * Math.sin(z * 0.043 + 0.7);
  const R = T.ridges;
  const spur = (z, y, s) =>                          // 沿岩壁往下的稜線與溝槽，相鄰等高線一起彎才有立體感
    R[0] * Math.sin(z * 0.115 + s * 2.1 + y * 0.045)
    + R[1] * Math.sin(z * 0.27 + s * 4.7 - y * 0.07)
    + R[2] * Math.sin(z * 0.66 + s + y * 0.21);
  const wallX = (s, y, z) => {
    const base = Ginv(y - floorY(z)) * widen(z);
    return cx(z) + s * Math.max(0, base + spur(z, y, s) * sstep(0, 6, base));
  };

  // ---- 相機（先轉向、再俯角）----
  const cam = { x: 0, y: 0, z: 0 };
  let cyw = 1, syw = 0, cp = 1, sp = 0;
  const out = { x: 0, y: 0 };
  let W = 0, H = 0, DPR = 1;
  function proj(x, y, z) {
    const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
    const x1 = dx * cyw - dz * syw, z1 = dx * syw + dz * cyw;
    const yy = dy * cp + z1 * sp, zz = -dy * sp + z1 * cp;
    if (zz < 0.6) return false;
    const f = H * CAM.focal;
    out.x = W / 2 + (x1 / zz) * f;
    out.y = H * 0.5 - (yy / zz) * f;
    return true;
  }

  // 留白區：文字與圖片後方的線淡出（不加暗色底）。在 1/8 解析度的小畫布上畫方塊再模糊，放大後邊緣自然柔和
  const Q = 8;
  const zc = document.createElement('canvas');
  const zx = zc.getContext('2d');
  let zoneEls = [];
  const refreshZones = () => { zoneEls = C.clear ? [...document.querySelectorAll(C.clear.selector)] : []; };
  refreshZones();

  let maxDpr = C.maxPixelRatio;
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, maxDpr);
    for (const c of [canvas, lc]) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); }
    zc.width = Math.ceil(W / Q); zc.height = Math.ceil(H / Q);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    lx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  resize();

  // ---- 海雪 ----
  const snow = Array.from({ length: mobile ? C.snow.mobile : C.snow.desktop }, () => ({
    x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.6, a: 0.12 + Math.random() * 0.35, v: 0.004 + Math.random() * 0.01,
  }));

  // ---- 狀態 ----
  let target = 0, u = 0, light = 1;
  const pointer = { x: 0, y: 0, on: false };
  const armL = [], armR = [];
  const Z_STEP = L.sampleStep;

  function arm(s, y, zA, zB, arr) {                 // 一側岩壁上，等高線 y 從 zA 到 zB 的投影點
    arr.length = 0;
    let z = zA;
    while (z <= zB) {
      if (proj(wallX(s, y, z), y, z)) arr.push(out.x, out.y);
      else if (arr.length) break;
      z = z === zA ? (Math.floor(zA / Z_STEP) + 1) * Z_STEP : z + Z_STEP;   // 取樣點固定在世界格點上，捲動時線不抖
    }
  }

  function render(dt, time) {
    u += (target - u) * (reduceMotion ? 1 : Math.min(1, CAM.follow * dt * 60));
    const dive = sstep(0, CAM.diveEnd, u);           // 前段：從海床上方俯瞰 → 潛入溝內
    cam.z = u * CAM.travel;
    cam.x = cx(cam.z) * lerp(0.6, 1, dive);
    cam.y = floorY(cam.z) + lerp(CAM.heightStart, CAM.heightEnd, dive);
    const yaw = Math.atan((cx(cam.z + 28) - cx(cam.z)) / 28) * 0.8;
    const pitch = lerp(CAM.pitchStart, CAM.pitchEnd, dive);
    cyw = Math.cos(yaw); syw = Math.sin(yaw); cp = Math.cos(pitch); sp = Math.sin(pitch);

    // 背景：依深度漸暗
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgb(mixRgb(colSurface, colHadal, Math.min(1, u * 1.3))));
    g.addColorStop(0.55, rgb(mixRgb(colAbyss, colHadal, u)));
    g.addColorStop(1, rgb(mixRgb(colHadal, colFloor, u)));
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (u < 0.4) {                                   // 頂光，只在淺處
      const rg = ctx.createRadialGradient(W / 2, -H * 0.15, 0, W / 2, -H * 0.15, H * 0.9);
      rg.addColorStop(0, `rgba(120,200,215,${0.32 * (1 - u / 0.4)})`);
      rg.addColorStop(1, 'rgba(120,200,215,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
    }

    // 等高線：左壁遠端 → 溝底轉彎 → 右壁遠端，一整條連續路徑
    lx.globalCompositeOperation = 'source-over';
    lx.clearRect(0, 0, W, H);
    lx.lineCap = 'round';
    lx.lineJoin = 'round';
    const zNear = cam.z + 0.5, zFar = cam.z + L.farDistance;
    const pingD = reduceMotion ? -1 : ((time % C.echo.everySeconds) / C.echo.everySeconds) * (L.farDistance + 10) - 5;
    const yTop = floorY(cam.z) + T.wallHeight + 14, yBot = floorY(zFar);
    const deepest = T.slope * (CAM.travel + L.farDistance);
    for (let y = Math.floor(yTop / L.spacing) * L.spacing; y > yBot; y -= L.spacing) {
      const zApex = -y / T.slope;                    // 這條等高線在溝底轉彎的位置
      const zA = Math.max(zNear, zApex);
      if (zA >= zFar) continue;
      const a = L.opacity * (1 - L.deepDim * Math.min(1, -y / deepest));
      arm(-1, y, zA, zFar, armL);
      arm(1, y, zA, zFar, armR);
      lx.beginPath();
      for (let n = armL.length - 2; n >= 0; n -= 2) {
        if (n === armL.length - 2) lx.moveTo(armL[n], armL[n + 1]); else lx.lineTo(armL[n], armL[n + 1]);
      }
      if ((zApex < zNear || !armL.length) && armR.length) lx.moveTo(armR[0], armR[1]);   // 轉彎點在鏡頭後方：兩側各一條
      for (let n = 0; n < armR.length; n += 2) lx.lineTo(armR[n], armR[n + 1]);
      lx.strokeStyle = `rgba(${lineRgb},${a})`;
      lx.lineWidth = L.width;
      lx.stroke();

      // 聲納回聲：在 pingD 附近把兩側同一段再描亮
      const pz = cam.z + pingD;
      if (pingD > 0 && pz > zA && pz - 3 < zFar) {
        lx.beginPath();
        for (let s = -1; s <= 1; s += 2) {
          let started = false;
          for (let zb = Math.max(zA, pz - 3); zb <= Math.min(zFar, pz + 0.4); zb += 0.4) {
            if (!proj(wallX(s, y, zb), y, zb)) continue;
            if (!started) { lx.moveTo(out.x, out.y); started = true; } else lx.lineTo(out.x, out.y);
          }
        }
        lx.strokeStyle = `rgba(${echoRgb},${C.echo.opacity})`;
        lx.lineWidth = L.width + 0.5;
        lx.stroke();
      }
    }

    // 遠處霧：以海溝遠端為中心，整片柔和淡出
    let fx = W / 2, fy = H * 0.4;
    const zf = cam.z + 70;
    if (proj(cx(zf), floorY(zf), zf)) { fx = out.x; fy = out.y; }
    lx.globalCompositeOperation = 'destination-out';
    const fog = lx.createRadialGradient(fx, fy, 0, fx, fy, Math.min(W, H) * C.fog.radius);
    fog.addColorStop(0, `rgba(0,0,0,${C.fog.strength})`);
    fog.addColorStop(0.4, `rgba(0,0,0,${C.fog.strength * 0.3})`);
    fog.addColorStop(1, 'rgba(0,0,0,0)');
    lx.fillStyle = fog;
    lx.fillRect(0, 0, W, H);
    // 留白區：文字與圖片後方的線淡出
    const clearStrength = C.clear ? (mobile ? C.clear.strengthMobile : C.clear.strength) : 0;
    if (zoneEls.length && clearStrength > 0) {
      const pad = C.clear.padding;
      zx.setTransform(1, 0, 0, 1, 0, 0);
      zx.filter = 'none';
      zx.clearRect(0, 0, zc.width, zc.height);
      zx.fillStyle = '#000';
      let any = false;
      for (const el of zoneEls) {
        const r = el.getBoundingClientRect();
        if (r.bottom < -pad || r.top > H + pad || r.width === 0) continue;
        zx.fillRect((r.left - pad) / Q, (r.top - pad) / Q, (r.width + pad * 2) / Q, (r.height + pad * 2) / Q);
        any = true;
      }
      if (any) {
        if ('filter' in zx) {               // 在小畫布上再模糊一次，讓邊緣更柔
          zx.filter = `blur(${C.clear.feather / Q}px)`;
          zx.globalCompositeOperation = 'copy';
          zx.drawImage(zc, 0, 0);
          zx.globalCompositeOperation = 'source-over';
          zx.filter = 'none';
        }
        lx.globalCompositeOperation = 'destination-out';
        lx.globalAlpha = clearStrength;
        lx.imageSmoothingEnabled = true;
        lx.drawImage(zc, 0, 0, zc.width * Q, zc.height * Q);
        lx.globalAlpha = 1;
      }
    }
    // 潛水燈：照到的線變亮
    if (pointer.on && light > 0) {
      lx.globalCompositeOperation = 'source-atop';
      const r = mobile ? C.torch.radiusMobile : C.torch.radius;
      const tr = lx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, r);
      tr.addColorStop(0, `rgba(${torchRgb},${C.torch.strength * light})`);
      tr.addColorStop(1, `rgba(${torchRgb},0)`);
      lx.fillStyle = tr;
      lx.fillRect(0, 0, W, H);
    }
    lx.globalCompositeOperation = 'source-over';

    // 合成：柔光暈 + 清晰線
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (C.glow > 0 && 'filter' in ctx) {
      ctx.filter = `blur(${Math.round(5 * DPR)}px)`;
      ctx.globalAlpha = C.glow;
      ctx.drawImage(lc, 0, 0);
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(lc, 0, 0);
    ctx.restore();

    // 海雪
    for (const f of snow) {
      if (!reduceMotion) { f.y += f.v * dt * 6; if (f.y > 1.02) { f.y = -0.02; f.x = Math.random(); } }
      ctx.fillStyle = `rgba(205,238,244,${f.a * (1 - u * 0.5)})`;
      ctx.beginPath();
      ctx.arc(f.x * W, f.y * H, f.r, 0, 6.283);
      ctx.fill();
    }
  }

  return {
    render,
    resize,
    setTarget(v) { target = clamp01(v); },
    jumpTo(v) { target = u = clamp01(v); },
    setPointer(x, y) { pointer.x = x; pointer.y = y; pointer.on = true; },
    setLightLevel(v) { light = clamp01(v); },
    lowerQuality() { maxDpr = 1; resize(); },
    refreshZones,
  };
}
