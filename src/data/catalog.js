// 作品總表：遊戲（games.json）與接案／動畫作品（works.json）合在一起，給作品卡片與頁面產生使用
// 遊戲頁在 /games/<slug>/，其他作品頁在 /works/<slug>/
import games from './games.json';
import works from './works.json';

export const allWorks = [
  ...games.map((g) => ({ ...g, href: `/games/${g.slug}/` })),
  ...works.map((w) => ({ ...w, href: `/works/${w.slug}/` })),
];

export { games, works };
