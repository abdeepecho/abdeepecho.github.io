// 背景海溝（2D canvas）：以真實的馬里亞納海溝地形（NOAA ETOPO1）畫成海圖等高線
// - 地形資料 public/data/mariana.json 由 tools/bathy_contours.py 產生，背景另外載入，載入前只顯示深度漸層
// - 鏡頭沿海溝從東北端往西南前進，最後抵達挑戰者深淵；方向固定不轉、只往下不回升，捲動時不晃
// - 海圖畫法：細線不發光，每 500 m 一條加粗計曲線，整千公尺標水深數字（字寫在線上方，線不斷開）
// - 每條等高線是一整條連續路徑；遠處的霧、文字與圖片後方的留白都用整片遮罩處理
// 所有可調數值在 src/data/scene.json 的 contour。

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, k) => a + (b - a) * k;
const sstep = (a, b, v) => { const k = clamp01((v - a) / (b - a)); return k * k * (3 - 2 * k); };
const hexRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgb = (c) => `rgb(${c.map((v) => Math.round(v)).join(',')})`;
const mixRgb = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));

// 經緯度顯示：11°21′N 142°11′E
export function formatLatLon(lat, lon) {
  const dm = (v, pos, neg) => {
    const a = Math.abs(v);
    let d = Math.floor(a), m = Math.round((a - d) * 60);
    if (m === 60) { d += 1; m = 0; }
    return `${d}°${String(m).padStart(2, '0')}′${v >= 0 ? pos : neg}`;
  };
  return `${dm(lat, 'N', 'S')}　${dm(lon, 'E', 'W')}`;
}

export function createContourTrench(canvas, C, { mobile = false, reduceMotion = false } = {}) {
  const ctx = canvas.getContext('2d');
  const lc = document.createElement('canvas');   // 等高線圖層（先畫線、套遮罩，再合成到主畫布）
  const lx = lc.getContext('2d');
  const CAM = C.camera, L = C.lines, E = C.verticalExaggeration;
  const colSurface = hexRgb(C.colors.surface), colAbyss = hexRgb(C.colors.abyss), colHadal = hexRgb(C.colors.hadal), colFloor = hexRgb(C.colors.floor);
  const lineRgb = hexRgb(C.colors.line).join(','), indexRgb = hexRgb(C.colors.indexLine).join(','), labelRgb = hexRgb(C.colors.label).join(',');

  // ---- 地形資料（背景載入）----
  let lines = null, path = null, pathLatLon = null, plen = 0, camX = null, camFloor = null;
  function setData(data) {
    lines = data.lines.map((l) => {
      const p = l.p, n = p.length / 2, xs = new Float32Array(n), zs = new Float32Array(n);
      let ax = 0, az = 0, minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
      for (let i = 0; i < n; i++) {   // 差分編碼：逐點累加還原（單位 0.1 km）
        ax += p[i * 2]; az += p[i * 2 + 1];
        xs[i] = ax / 10; zs[i] = az / 10;
        minx = Math.min(minx, xs[i]); maxx = Math.max(maxx, xs[i]); minz = Math.min(minz, zs[i]); maxz = Math.max(maxz, zs[i]);
      }
      // 水深標註點：只放整千公尺，沿線每 labelEveryKm 一個（固定在地形上，捲動時不滑動）
      const anchors = [];
      if (l.d % 1000 === 0) {
        let acc = L.labelEveryKm / 2;
        for (let i = 1; i < n; i++) { acc += Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]); if (acc >= L.labelEveryKm) { anchors.push(i); acc = 0; } }
      }
      return { d: l.d, y: (-l.d / 1000) * E, xs, zs, n, bb: [minx, maxx, minz, maxz], index: l.d % data.index === 0, anchors, text: `−${l.d.toLocaleString('en-US')}` };
    });
    path = data.path; pathLatLon = data.pathLatLon; plen = path.length - 1;
    // 鏡頭軌道：左右位置取前後 smoothKm 的平均（只緩慢平移，不轉向）；溝底高度只往下、不回升
    camX = []; camFloor = [];
    let run = Infinity;
    const w = CAM.smoothKm;
    for (let i = 0; i <= plen; i++) {
      let sx = 0, sf = 0, n = 0;
      for (let j = Math.max(0, i - w); j <= Math.min(plen, i + w); j++) { sx += path[j][0]; sf += path[j][2]; n++; }
      camX.push(sx / n);
      run = Math.min(run, sf / n);
      camFloor.push(run);
    }
  }
  const at = (arr, s) => { s = Math.max(0, Math.min(plen, s)); const i = Math.floor(s), k = s - i; return lerp(arr[i], arr[Math.min(plen, i + 1)], k); };
  const pathZ = (s) => { s = Math.max(0, Math.min(plen, s)); const i = Math.floor(s), k = s - i; return lerp(path[i][1], path[Math.min(plen, i + 1)][1], k); };

  // ---- 相機（俯角，方向固定朝海溝整體走向 +z）----
  const cam = { x: 0, y: 0, z: 0, s: 0 };
  let cp = 1, sp = 0;
  const out = { x: 0, y: 0, d: 0 };
  let W = 0, H = 0, DPR = 1;
  function proj(x, y, z) {
    const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
    const yy = dy * cp + dz * sp, zz = -dy * sp + dz * cp;
    if (zz < 0.6) return false;
    const f = H * CAM.focal;
    out.x = W / 2 + (dx / zz) * f;
    out.y = H * 0.5 - (yy / zz) * f;
    out.d = zz;
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
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    lx.setTransform(DPR, 0, 0, DPR, 0, 0);
    zc.width = Math.ceil(W / Q); zc.height = Math.ceil(H / Q);
  }
  resize();

  let target = 0, u = 0;
  const labels = [];

  function drawLines() {
    const far2 = L.farKm * L.farKm;
    labels.length = 0;
    for (const ln of lines) {
      const bb = ln.bb;
      const ddx = Math.max(bb[0] - cam.x, 0, cam.x - bb[1]), ddz = Math.max(bb[2] - cam.z, 0, cam.z - bb[3]);
      if (ddx * ddx + ddz * ddz > far2) continue;
      lx.beginPath();
      let started = false;
      for (let i = 0; i < ln.n; i++) {
        if (proj(ln.xs[i], ln.y, ln.zs[i])) { if (!started) { lx.moveTo(out.x, out.y); started = true; } else lx.lineTo(out.x, out.y); }
        else started = false;
      }
      lx.strokeStyle = ln.index ? `rgba(${indexRgb},${L.indexOpacity})` : `rgba(${lineRgb},${L.opacity})`;
      lx.lineWidth = ln.index ? L.indexWidth : L.width;
      lx.stroke();
      for (const j of ln.anchors) labels.push({ ln, j, dist: Math.hypot(ln.xs[j] - cam.x, ln.zs[j] - cam.z) });
    }
  }

  // 水深數字：沿線方向、固定字級、寫在線的上方；太陡、太遠、互相重疊的不標
  function drawLabels() {
    lx.font = C.labels.font;
    lx.textAlign = 'center';
    lx.textBaseline = 'bottom';
    labels.sort((a, b) => a.dist - b.dist);
    const boxes = [];
    let drawn = 0;
    for (const lb of labels) {
      if (drawn >= C.labels.max) break;
      const { ln, j } = lb;
      if (!proj(ln.xs[j], ln.y, ln.zs[j])) continue;
      const x0 = out.x, y0 = out.y, d = out.d;
      if (d > C.labels.maxDistance || x0 < 30 || x0 > W - 30 || y0 < 70 || y0 > H - 20) continue;
      const j2 = j + 1 < ln.n ? j + 1 : j - 1;
      if (!proj(ln.xs[j2], ln.y, ln.zs[j2])) continue;
      let ang = Math.atan2(out.y - y0, out.x - x0);
      if (ang > Math.PI / 2) ang -= Math.PI;
      if (ang < -Math.PI / 2) ang += Math.PI;
      if (Math.abs(ang) > 1.2) continue;
      if (boxes.some((b) => Math.abs(b[0] - x0) < 70 && Math.abs(b[1] - y0) < 22)) continue;
      boxes.push([x0, y0]);
      const fade = d < 12 ? d / 12 : 1;
      lx.save();
      lx.translate(x0, y0);
      lx.rotate(ang);
      lx.fillStyle = `rgba(${labelRgb},${C.labels.opacity * fade})`;
      lx.fillText(ln.text, 0, -3);
      lx.restore();
      drawn++;
    }
  }

  function clearZones() {
    const strength = C.clear ? (mobile ? C.clear.strengthMobile : C.clear.strength) : 0;
    if (!zoneEls.length || strength <= 0) return;
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
    if (!any) return;
    if ('filter' in zx) {               // 在小畫布上再模糊一次，讓邊緣更柔
      zx.filter = `blur(${C.clear.feather / Q}px)`;
      zx.globalCompositeOperation = 'copy';
      zx.drawImage(zc, 0, 0);
      zx.globalCompositeOperation = 'source-over';
      zx.filter = 'none';
    }
    lx.globalCompositeOperation = 'destination-out';
    lx.globalAlpha = strength;
    lx.imageSmoothingEnabled = true;
    lx.drawImage(zc, 0, 0, zc.width * Q, zc.height * Q);
    lx.globalAlpha = 1;
    lx.globalCompositeOperation = 'source-over';
  }

  function render(dt) {
    u += (target - u) * (reduceMotion ? 1 : Math.min(1, CAM.follow * dt * 60));

    // 背景：依深度漸暗
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgb(mixRgb(colSurface, colHadal, Math.min(1, u * 1.3))));
    g.addColorStop(0.55, rgb(mixRgb(colAbyss, colHadal, u)));
    g.addColorStop(1, rgb(mixRgb(colHadal, colFloor, u)));
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (!lines) return;

    // 鏡頭：開場在海面上方俯瞰，潛入後停在岩壁中段往下看
    const dive = sstep(0, CAM.diveEnd, u);
    const s = u * (plen - 6);
    const floorUnits = (at(camFloor, s) / 1000) * E;
    cam.s = s;
    cam.x = at(camX, s);
    cam.z = pathZ(s);
    cam.y = floorUnits + lerp(CAM.heightStart, CAM.heightEnd, dive);
    const pitch = lerp(CAM.pitchStart, CAM.pitchEnd, dive);
    cp = Math.cos(pitch); sp = Math.sin(pitch);

    lx.globalCompositeOperation = 'source-over';
    lx.clearRect(0, 0, W, H);
    lx.lineCap = 'round';
    lx.lineJoin = 'round';
    drawLines();

    // 遠處的霧：正前方遠處、與溝底同高（不會蓋在近處的溝底上）
    let fx = W / 2, fy = H * 0.4;
    if (proj(cam.x, floorUnits, cam.z + C.fog.distanceKm)) { fx = out.x; fy = out.y; }
    lx.globalCompositeOperation = 'destination-out';
    const fog = lx.createRadialGradient(fx, fy, 0, fx, fy, Math.min(W, H) * C.fog.radius);
    fog.addColorStop(0, `rgba(0,0,0,${C.fog.strength})`);
    fog.addColorStop(0.4, `rgba(0,0,0,${C.fog.strength * 0.3})`);
    fog.addColorStop(1, 'rgba(0,0,0,0)');
    lx.fillStyle = fog;
    lx.fillRect(0, 0, W, H);
    lx.globalCompositeOperation = 'source-over';
    drawLabels();
    clearZones();

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(lc, 0, 0);
    ctx.restore();
  }

  // 背景載入地形資料；失敗時只留深度漸層
  const ready = fetch(C.dataUrl)
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then((data) => { setData(data); return true; })
    .catch((err) => { console.info(`[DeepEcho] 地形資料載入失敗：${err && err.message}`); return false; });

  return {
    render,
    resize,
    ready,
    setTarget(v) { target = clamp01(v); },
    jumpTo(v) { target = u = clamp01(v); },
    lowerQuality() { maxDpr = 1; resize(); },
    refreshZones,
    // 目前鏡頭所在的經緯度（資料載入前為 null）
    position() { return pathLatLon ? pathLatLon[Math.round(Math.max(0, Math.min(plen, cam.s)))] : null; },
  };
}
