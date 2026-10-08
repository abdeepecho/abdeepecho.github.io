# 幽海工作室 DeepEcho 官網

Astro + three.js 靜態網站，部署在 GitHub Pages：https://abdeepecho.github.io/

- 繁體中文在 `/`，英文在 `/en/`
- 首頁是「往海溝下潛」：捲動 = 下潛，每個區塊是一個深度帶（0 m、200 m、1,000 m、4,000 m、6,000 m、10,994 m）
- 遊戲作品頁由 `src/data/games.json` 自動產生：`/games/<slug>/`、`/en/games/<slug>/`
- 作品列表：`/works/`、`/en/works/`（依 `type` 篩選：original 原創遊戲、commission 接案作品、animation 3D 動畫）

## 本機開發

需要 Node.js（建議 22 以上）與 npm。

```
npm install
npm run dev       # 開發伺服器 http://localhost:4321
npm run build     # 產生 dist/
npm run preview   # 預覽 dist/ http://localhost:4321（或 --port 指定）
```

## 要改內容時改哪裡

| 想改的東西 | 檔案 |
|---|---|
| 介面文字（中文／英文） | `src/i18n/zh-Hant.json`、`src/i18n/en.json` |
| 信箱、社群連結、服務、工具、流程、常見問題清單、表單網址、接案開關 | `src/data/site.json` |
| 遊戲資料：名稱、簡介、截圖、配樂、獎項、特色、Steam 連結 | `src/data/games.json` |
| 下潛場景：深度對照、每帶背景照片與壓暗程度、粒子數量與速度、潛水燈、聲納、環境音 | `src/data/scene.json` |
| 顏色、字體、字級、間距 | `src/styles/tokens.css` |

## 字級規則

全站只有五階字級（`tokens.css`）：`--fs-display`（只用在開場標語）、`--fs-h2`（所有區塊標題）、`--fs-h3`（卡片、服務、獎項、流程、常見問題標題）、`--fs-body`（所有內文）、`--fs-small`（標籤、說明、頁尾）。標題用 Noto Serif TC 700，內文 Noto Sans TC 400／500，Cinzel 只用在 DEEP ECHO 字標與水深數字。新增樣式時不要寫其他 font-size。

新增語言：在 `src/i18n/` 加一個 `<語言>.json`，並在 `src/i18n/index.js` 的 `LOCALES` 加一筆，再新增對應的 `src/pages/<prefix>/` 頁面。語言選單、hreflang 與 sitemap 會自動帶入。

新增遊戲：在 `src/data/games.json` 加一筆，圖片放到 `public/assets/games/<slug>/`。

## 接案開關

`src/data/site.json` 的 `commissionsOpen`：

- `true`：顯示「委託我們」按鈕、合作流程、常見問題與委託表單
- `false`：以上都隱藏，改顯示「目前暫停接案」說明，信箱按鈕改成琥珀色

改完推送到 master 即可（GitHub Actions 會重新建置）。

## 委託表單

送到 Formspree：`src/data/site.json` 的 `formEndpoint`（目前 `https://formspree.io/f/xwlvplpa`）。前端驗證、honeypot 欄位 `_gotcha`、送出結果顯示在表單內。

## 必須保留

- `public/google26b502c8897e8824.html`：Google Search Console 驗證檔，不要刪除或修改
- `public/robots.txt`：指向 `sitemap-index.xml`
- `public/silent-wreckage.html`、`public/en/silent-wreckage.html`：舊網址轉址到新作品頁
- `/sitemap.xml` 由 `src/pages/sitemap.xml.ts` 產生，轉指向 `@astrojs/sitemap` 的 `sitemap-0.xml`，避免 Search Console 已登錄的舊網址失效
- 首頁 `#contact` 錨點（lit.link 連到這裡）

## 部署（上線切換）

`.github/workflows/deploy.yml` 會在推送到 `master` 時建置並部署。**第一次上線前**需要：

1. 把 `astro-redesign` 分支合併進 `master`
2. GitHub repo 的 Settings → Pages → Build and deployment → Source 改成「GitHub Actions」

改之前，GitHub Pages 仍然直接發布 master 分支的檔案（舊網站）。

## 背景照片

每個深度帶一張照片（Pexels 授權，紀錄在 `assets/source/LICENSES.md`），原始檔在 `assets/source/backgrounds/`。
換照片或調整裁切：改 `src/data/scene.json` 的 `backgrounds.images`（檔名、焦點、portraitFocus），然後執行

```
python tools/make-backgrounds.py
```

會輸出 `public/assets/bg/*.webp`（桌機 1920／1280／768 與手機直式版本）並更新 `src/data/backgrounds.generated.json`。需要 Python 3 與 Pillow。
每帶的壓暗程度在 `depthBands[].grade`。three.js 只負責海雪、氣泡與發光生物；WebGL 不可用或「減少動態」時只顯示照片。

## 偵錯

- `?scene=off`：關閉粒子層（模擬 WebGL 不可用）
- `?scene=on`：低效能裝置也強制開啟粒子層
- `?lang=en` / `?lang=zh-Hant`：切換並記住語言
- 重新看開場：清除瀏覽器 localStorage 的 `deepecho-intro-seen`
