#!/usr/bin/env python3
"""把背景照片輸出成網站用的 WebP（橫式三種寬度 + 手機直式兩種寬度）。

設定都在 src/data/scene.json 的 "backgrounds"：
    sourceDir        原始照片資料夾（相對於專案根目錄）
    outDir           輸出資料夾（public/assets/bg）
    landscapeAspect  桌機用的裁切比例，例如 [16, 10]
    landscapeWidths  桌機輸出寬度
    portraitAspect   手機用的裁切比例，例如 [9, 16]
    portraitWidths   手機輸出寬度
    images[]         key、file、focus（裁切焦點 0–1）、portraitFocus

執行：
    python tools/make-backgrounds.py

輸出 <outDir>/<key>-<寬度>.webp 與 <key>-p-<寬度>.webp，並寫出
src/data/backgrounds.generated.json 記錄每個檔案的實際尺寸（網頁的 srcset 由它產生）。
照片不會被放大：來源不夠寬時，該尺寸以來源寬度輸出並去除重複。

需要 Python 3 與 Pillow（pip install pillow）。
"""
import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCENE = os.path.join(ROOT, 'src', 'data', 'scene.json')
MANIFEST = os.path.join(ROOT, 'src', 'data', 'backgrounds.generated.json')


def crop_to_aspect(im, aspect, focus):
    """依焦點裁成指定比例（盡量保留最大面積）。"""
    w, h = im.size
    target = aspect[0] / aspect[1]
    if w / h > target:
        cw, ch = round(h * target), h
    else:
        cw, ch = w, round(w / target)
    fx, fy = focus
    left = min(max(round(fx * w - cw / 2), 0), w - cw)
    top = min(max(round(fy * h - ch / 2), 0), h - ch)
    return im.crop((left, top, left + cw, top + ch))


def export(im, widths, aspect, out_dir, stem, quality):
    files = []
    done = set()
    for target in sorted(widths, reverse=True):
        width = min(target, im.width)
        if width in done:
            continue
        done.add(width)
        height = round(width * aspect[1] / aspect[0])
        resized = im.resize((width, height), Image.LANCZOS) if width != im.width else im
        name = f'{stem}-{width}.webp'
        resized.save(os.path.join(out_dir, name), 'WEBP', quality=quality, method=6)
        size = os.path.getsize(os.path.join(out_dir, name))
        files.append({'file': name, 'width': width, 'height': height, 'bytes': size})
        print(f'  {name}  {width}x{height}  {size // 1024} KB')
    return files


def main():
    cfg = json.load(open(SCENE, encoding='utf-8'))['backgrounds']
    src_dir = os.path.join(ROOT, cfg['sourceDir'])
    out_dir = os.path.join(ROOT, cfg['outDir'])
    os.makedirs(out_dir, exist_ok=True)
    public_prefix = '/' + os.path.relpath(out_dir, os.path.join(ROOT, 'public')).replace(os.sep, '/') + '/'

    manifest = {'_說明': '由 tools/make-backgrounds.py 產生，請勿手動修改', 'images': {}}
    for item in cfg['images']:
        path = os.path.join(src_dir, item['file'])
        if not os.path.exists(path):
            sys.exit(f'找不到來源照片：{path}')
        print(f"{item['key']}  <-  {item['file']}")
        im = Image.open(path).convert('RGB')
        land = crop_to_aspect(im, cfg['landscapeAspect'], item.get('focus', [0.5, 0.5]))
        port = crop_to_aspect(im, cfg['portraitAspect'], item.get('portraitFocus', item.get('focus', [0.5, 0.5])))
        manifest['images'][item['key']] = {
            'source': item['file'],
            'base': public_prefix,
            'landscape': export(land, cfg['landscapeWidths'], cfg['landscapeAspect'], out_dir, item['key'], cfg['quality']),
            'portrait': export(port, cfg['portraitWidths'], cfg['portraitAspect'], out_dir, f"{item['key']}-p", cfg['quality']),
        }

    with open(MANIFEST, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'寫出 {os.path.relpath(MANIFEST, ROOT)}')


if __name__ == '__main__':
    main()
