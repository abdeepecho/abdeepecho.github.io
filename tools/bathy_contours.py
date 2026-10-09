"""把 NOAA ETOPO1 馬里亞納海溝地形轉成網頁用的等高線（JSON）。

用法（在網站根目錄）：python tools/bathy_contours.py assets/source/bathymetry/etopo1_mariana.csv public/data/mariana.json
需要 Python 3、numpy、contourpy（matplotlib 會一起裝）。

1. 經緯度換成公里（以區域中心為原點）。
2. 沿海溝最深處找出中軸線並平滑，作為鏡頭路徑：從東北端出發，往西南走到挑戰者深淵。
3. 座標旋轉，讓海溝大致朝鏡頭前方（+z）；只保留中軸兩側一定範圍內的等高線。
4. 每 100 m 一條等高線（每 500 m 為加粗的計曲線），簡化、平滑後量化成 0.1 km 整數，縮小檔案。
"""
import sys
import json
import math
import numpy as np
from contourpy import contour_generator

SRC, OUT = sys.argv[1], sys.argv[2]
STEP_M = 100
INDEX_M = 500
CORRIDOR_KM = 140          # 中軸兩側保留的範圍
SIMPLIFY_KM = 0.2
SMOOTH_ITER = 2             # Chaikin 平滑次數：去掉 1 弧分網格留下的折角

d = np.genfromtxt(SRC, delimiter=',', skip_header=2)
lats = np.unique(d[:, 0])
lons = np.unique(d[:, 1])
Z = d[:, 2].reshape(len(lats), len(lons))
lat0, lon0 = lats.mean(), lons.mean()
KX = 111.32 * math.cos(math.radians(lat0))
KY = 110.57
X, Y = np.meshgrid((lons - lon0) * KX, (lats - lat0) * KY)

# ---- 海溝中軸：每個經度找附近最深點，往兩端追蹤 ----
deep_i, deep_j = np.unravel_index(Z.argmin(), Z.shape)     # 挑戰者深淵
def trace(j_range, i_start):
    pts, i = [], i_start
    for j in j_range:
        lo, hi = max(0, i - 6), min(len(lats), i + 7)
        i = lo + int(np.argmin(Z[lo:hi, j]))
        pts.append((j, i))
    return pts
east = trace(range(deep_j, len(lons) - 4), deep_i)
axis_idx = east                                    # 從深淵往東北
ax = np.array([[X[i, j], Y[i, j], Z[i, j]] for j, i in axis_idx])
# 平滑（移動平均），去掉鋸齒
k = 15
pad = np.pad(ax, ((k, k), (0, 0)), mode='edge')
ker = np.ones(2 * k + 1) / (2 * k + 1)
ax_s = np.stack([np.convolve(pad[:, c], ker, mode='valid') for c in range(3)], axis=1)
ax_s = ax_s[::-1]                                  # 改成從東北端往西南走，終點是深淵

# ---- 旋轉：整體方向朝 +z ----
dx, dy = ax_s[-1, 0] - ax_s[0, 0], ax_s[-1, 1] - ax_s[0, 1]
ang = math.atan2(dx, dy)                           # 讓 (dx,dy) 轉到 (0,+)
ca, sa = math.cos(ang), math.sin(ang)
def rot(x, y):
    return x * ca - y * sa, x * sa + y * ca
px, pz = rot(ax_s[:, 0], ax_s[:, 1])
z_off = pz[0]
px, pz = px - px[0], pz - z_off
x_off = rot(ax_s[0, 0], ax_s[0, 1])[0]

# 鏡頭路徑：每 1 km 重新取樣
seg = np.hypot(np.diff(px), np.diff(pz))
s = np.concatenate([[0], np.cumsum(seg)])
S = np.arange(0, s[-1], 1.0)
path = np.stack([np.interp(S, s, px), np.interp(S, s, pz), np.interp(S, s, ax_s[:, 2])], axis=1)

def chaikin(pts, n):
    for _ in range(n):
        if len(pts) < 3:
            return pts
        a, b = pts[:-1], pts[1:]
        mid = np.empty((len(a) * 2, 2))
        mid[0::2] = 0.75 * a + 0.25 * b
        mid[1::2] = 0.25 * a + 0.75 * b
        pts = np.vstack([pts[:1], mid, pts[-1:]])
    return pts


def simplify(pts, tol):
    # Douglas–Peucker
    if len(pts) < 3:
        return pts
    keep = np.zeros(len(pts), bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        p, q = pts[a], pts[b]
        v = q - p
        L = np.hypot(*v) or 1e-9
        dist = np.abs(v[0] * (pts[a + 1:b, 1] - p[1]) - v[1] * (pts[a + 1:b, 0] - p[0])) / L
        m = int(np.argmax(dist))
        if dist[m] > tol:
            keep[a + 1 + m] = True
            stack += [(a, a + 1 + m), (a + 1 + m, b)]
    return pts[keep]

# 中軸附近的範圍（用旋轉後的座標判斷離路徑多遠）
from math import inf
gen = contour_generator(X, Y, Z, line_type='Separate')
lines = []
n_pts = 0
for level in range(-STEP_M, -11000, -STEP_M):
    for ln in gen.lines(level):
        rx, rz = rot(ln[:, 0], ln[:, 1])
        rx, rz = rx - x_off, rz - z_off
        # 離鏡頭路徑最近距離
        near = np.min(np.hypot(rx[:, None] - path[::5, 0][None, :], rz[:, None] - path[::5, 1][None, :]), axis=1)
        inside = near < CORRIDOR_KM
        if not inside.any():
            continue
        # 只留在範圍內的連續片段
        idx = np.flatnonzero(inside)
        splits = np.split(idx, np.flatnonzero(np.diff(idx) > 1) + 1)
        for part in splits:
            if len(part) < 4:
                continue
            pts = simplify(chaikin(simplify(np.stack([rx[part], rz[part]], axis=1), SIMPLIFY_KM), SMOOTH_ITER), 0.08)
            q = np.round(pts * 10).astype(int)
            q[1:] = np.diff(q, axis=0)             # 差分編碼：第一點是絕對座標，之後存相對位移，檔案小很多
            flat = q.reshape(-1).tolist()
            lines.append({'d': -level, 'p': flat})
            n_pts += len(q)

out = {
    'source': 'NOAA ETOPO1 (Amante & Eakins 2009), 1 arc-minute; Mariana Trench 9.5–14N, 140.5–147E',
    'units': 'x/z in 0.1 km, delta-encoded (p arrays: first point absolute, then differences), depth d in m',
    'step': STEP_M,
    'index': INDEX_M,
    'deepest': {'depth': int(-Z.min()), 'lat': round(float(lats[deep_i]), 3), 'lon': round(float(lons[deep_j]), 3)},
    'path': np.round(path, 1).tolist(),           # [x km, z km, 海底高度 m]
    'pathLatLon': [[round(float(a), 3), round(float(b), 3)] for a, b in zip(
        np.interp(S, s, (ax_s[:, 1] / KY) + lat0), np.interp(S, s, (ax_s[:, 0] / KX) + lon0))],
    'lines': lines,
}
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(out, f, separators=(',', ':'))
print('lines', len(lines), 'points', n_pts, 'path km', round(float(s[-1]), 1), 'axis depth range', int(path[:, 2].min()), int(path[:, 2].max()))
