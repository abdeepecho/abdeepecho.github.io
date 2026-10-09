# 幽海工作室 DeepEcho 官網

Astro 靜態網站，部署在 GitHub Pages：https://abdeepecho.github.io/

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
| 遊戲資料：名稱、簡介、主視覺、預告片、截圖、獎項、特色與配圖、Steam 與 Discord 連結 | `src/data/games.json` |
| 下潛場景：深度對照、背景海溝（地形、線條、鏡頭、回聲）、聲納開場、環境音 | `src/data/scene.json` |
| 顏色、字體、字級、間距 | `src/styles/tokens.css` |

## 字級規則

全站只有五階字級（`tokens.css`）：`--fs-display`（只用在遊戲頁的遊戲名稱）、`--fs-h2`（所有區塊標題）、`--fs-h3`（卡片、服務、獎項、流程、常見問題標題）、`--fs-body`（所有內文）、`--fs-small`（標籤、說明、頁尾）。標題用 Noto Serif TC 700，內文 Noto Sans TC 400／500，Cinzel 只用在 DEEP ECHO 字標與水深數字。新增樣式時不要寫其他 font-size。

新增語言（例如日文）：

1. `src/i18n/locales.json` 加一筆：`{ "code": "ja", "prefix": "ja", "name": "日本語", "short": "日本語" }`（第一筆是預設語言，放在網站根目錄）
2. 放一個 `src/i18n/ja.json` 字串檔（可從 `en.json` 複製後翻譯；缺的字串會退回中文）
3. `games.json`、`works.json` 等內容欄位可加上 `"ja": "..."`，沒有的會退回中文

所有頁面由 `src/pages/[...route].astro` 一次產生，語言選單、hreflang、sitemap、第一次造訪的自動轉址都會自動跟著更新，不需要複製頁面檔。

新增接案作品或動畫：在 `src/data/works.json` 加一筆（`type` 為 `commission` 或 `animation`），會產生 `/works/<slug>/` 作品頁，並出現在首頁與作品列表的卡片中。欄位：

- 必填：`slug`、`type`、`title`、`cover`（`shot` 第幾張當封面、`alt`）、`screenshots`（與遊戲相同：`dir`、`count`、`pattern`、`widths`、`size`）
- 選填：`altTitle`、`tagline`、`year`、`client`、`role`、`tools`（陣列）、`trailer`（YouTube，與遊戲相同）、`body`（各語言的段落陣列）、`credits`（`role`、`name`）、`meta`（頁面標題與描述）、`ogImage`

新增遊戲：在 `src/data/games.json` 加一筆，圖片放到 `public/assets/games/<slug>/`。主視覺（`keyart.image`）、特色配圖（`features[].image`）、預告片海報（`trailer.poster`）都寫檔名前綴，實際檔案是 `<前綴>-960.webp` 與 `<前綴>-1920.webp`。遊戲頁不在圖片上疊文字，也不加暗色漸層。

## 接案開關

`src/data/site.json` 的 `commissionsOpen`：

- `true`：顯示「委託我們」按鈕、合作流程、常見問題與委託表單
- `false`：以上都隱藏，改顯示「目前暫停接案」說明，信箱按鈕改成琥珀色

改完推送到 master 即可（GitHub Actions 會重新建置）。

## 委託表單

送到 Formspree：`src/data/site.json` 的 `formEndpoint`（目前 `https://formspree.io/f/xwlvplpa`）。前端驗證、honeypot 欄位 `_gotcha`、送出結果顯示在表單內，表單下方有個資用途說明（`form.privacy`）。

Formspree 後台建議設定：表單只接受來自 `abdeepecho.github.io` 的送出（Restrict to domain），並開啟 reCAPTCHA，避免表單網址被拿去灌垃圾信。

## 必須保留

- `public/google26b502c8897e8824.html`：Google Search Console 驗證檔，不要刪除或修改
- `public/robots.txt`：指向 `sitemap-index.xml`
- `public/silent-wreckage.html`、`public/en/silent-wreckage.html`：舊網址轉址到新作品頁
- `/sitemap.xml` 由 `src/pages/sitemap.xml.ts` 產生，轉指向 `@astrojs/sitemap` 的 `sitemap-0.xml`，避免 Search Console 已登錄的舊網址失效
- 首頁 `#contact` 錨點（lit.link 連到這裡）

## 資安設定

- **CSP（安全政策）**：`astro.config.mjs` 的 `security.csp`。建置時每頁加上 CSP meta，頁面自己的 inline script／style 由 Astro 算雜湊；外部只允許 Google 字型、Formspree、YouTube（nocookie）。要加新的外部服務（例如新的嵌入影片網站、分析工具）時，記得在這裡加網域，否則會被瀏覽器擋下。
- **自動部署的外部工具**鎖定在確切的版本（`deploy.yml` 裡的 commit 雜湊），`.github/dependabot.yml` 每月檢查一次，有新版會開 PR 提醒，不會自動合併。
- 沒有任何密碼或金鑰放在程式碼裡；Formspree 的表單網址本來就是公開的。

## 部署（上線切換）

`.github/workflows/deploy.yml` 會在推送到 `master` 時建置並部署。**第一次上線前**需要：

1. 把 `astro-redesign` 分支合併進 `master`
2. GitHub repo 的 Settings → Pages → Build and deployment → Source 改成「GitHub Actions」

改之前，GitHub Pages 仍然直接發布 master 分支的檔案（舊網站）。

## 背景海溝

首頁、作品頁與遊戲頁的背景是真實的馬里亞納海溝地形，畫成海圖等高線（`src/scripts/contour-trench.js`，2D canvas，不需要 WebGL）。
往下捲時鏡頭從海溝東北端前進，最後抵達挑戰者深淵；深度計下方顯示鏡頭所在的經緯度。

- 地形資料：NOAA ETOPO1（授權與下載紀錄在 `assets/source/bathymetry/LICENSE.md`），頁尾標註來源。
- 網頁用的等高線：`public/data/mariana.json`，背景載入；載入前只顯示深度漸層。重新產生：

```
python tools/bathy_contours.py assets/source/bathymetry/etopo1_mariana.csv public/data/mariana.json
```

  等高線間距（每 200 m）、計曲線（每 1000 m）、平滑程度都在這支腳本最上面設定。需要 Python 3、numpy、contourpy。
- 畫面可調數值在 `src/data/scene.json` 的 `contour`：垂直誇張倍率、鏡頭高度與角度、線的亮度與粗細、水深數字、霧、文字後方的留白，每一組都有中文說明。
- 每個深度帶對應的鏡頭位置在 `depthBands[].u`（0 海面，1 海溝底）；作品頁與遊戲頁用固定位置（`<ContourBackground at={...} />`）。

## 偵錯

- `?scene=off`：關閉背景海溝，只留漸層
- `?lang=en` / `?lang=zh-Hant`：切換並記住語言
- 重新看開場：清除瀏覽器 localStorage 的 `deepecho-intro-seen`
