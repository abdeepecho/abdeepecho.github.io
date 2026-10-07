// 舊的 /sitemap.xml（Search Console 可能已登錄）改成 sitemap index，指向 @astrojs/sitemap 產生的檔案
import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const base = site ? site.href.replace(/\/$/, '') : 'https://abdeepecho.github.io';
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${base}/sitemap-0.xml</loc></sitemap>
</sitemapindex>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
