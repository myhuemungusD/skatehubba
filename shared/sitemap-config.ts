export interface SitemapEntry {
  path: string;
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: number;
}

export const SITEMAP_ENTRIES: SitemapEntry[] = [
  {
    path: '/',
    changefreq: 'weekly',
    priority: 1.0,
  },
  {
    path: '/demo',
    changefreq: 'monthly',
    priority: 0.8,
  },
  {
    path: '/new-landing',
    changefreq: 'monthly',
    priority: 0.9,
  },
  {
    path: '/leaderboard',
    changefreq: 'daily',
    priority: 0.9,
  },
  {
    path: '/spots',
    changefreq: 'daily',
    priority: 0.9,
  },
  {
    path: '/privacy',
    changefreq: 'yearly',
    priority: 0.5,
  },
  {
    path: '/terms',
    changefreq: 'yearly',
    priority: 0.5,
  },
];
