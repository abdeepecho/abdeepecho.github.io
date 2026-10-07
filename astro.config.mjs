// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// 網站網址：GitHub Pages 使用者網站，不需要設定 base
export default defineConfig({
  site: 'https://abdeepecho.github.io',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  // 用 HTML 規則壓縮空白，避免中英文混排時行內空白被吃掉（v7 預設為 'jsx'）
  compressHTML: true,
  devToolbar: { enabled: false },
  // three.js 以動態載入獨立成一個 chunk（約 140 KB gzip），放寬警告門檻
  vite: { build: { chunkSizeWarningLimit: 700 } },
  integrations: [
    sitemap({
      // 舊網址轉址頁與 Google 驗證檔不列入 sitemap
      filter: (page) => !page.endsWith('.html') && !page.includes('silent-wreckage.html'),
      i18n: {
        defaultLocale: 'zh-Hant',
        locales: {
          'zh-Hant': 'zh-Hant',
          en: 'en',
        },
      },
    }),
  ],
});
