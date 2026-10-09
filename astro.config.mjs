// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readFileSync } from 'node:fs';

// 語言清單（與 src/i18n/locales.json 共用），sitemap 的 hreflang 依此產生
const localeList = JSON.parse(readFileSync(new URL('./src/i18n/locales.json', import.meta.url), 'utf-8'));

// 網站網址：GitHub Pages 使用者網站，不需要設定 base
export default defineConfig({
  site: 'https://abdeepecho.github.io',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  // 用 HTML 規則壓縮空白，避免中英文混排時行內空白被吃掉（v7 預設為 'jsx'）
  compressHTML: true,
  devToolbar: { enabled: false },
  // 安全政策（CSP）：建置時在每頁加上 <meta http-equiv="Content-Security-Policy">，
  // 頁面自己的 inline script / style 由 Astro 自動算出雜湊；外部只允許下列網域
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self' https://fonts.gstatic.com",
        "connect-src 'self' https://formspree.io",       // 委託表單送出、地形資料
        "frame-src https://www.youtube-nocookie.com",     // 遊戲頁預告片（點擊後才載入）
        "form-action https://formspree.io",
        "base-uri 'self'",
        "object-src 'none'",
      ],
      styleDirective: {
        resources: ["'self'", 'https://fonts.googleapis.com', { resource: "'unsafe-inline'", kind: 'attribute' }],
      },
      scriptDirective: { resources: ["'self'"] },
    },
  },
  integrations: [
    sitemap({
      // 舊網址轉址頁與 Google 驗證檔不列入 sitemap
      filter: (page) => !page.endsWith('.html') && !page.includes('silent-wreckage.html'),
      i18n: {
        defaultLocale: localeList[0].code,
        locales: Object.fromEntries(localeList.map((l) => [l.code, l.code])),
      },
    }),
  ],
});
