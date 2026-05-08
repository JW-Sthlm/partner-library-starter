import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Partner Library',
  description: 'A curated knowledge library for the partner ecosystem.',
  lang: 'en-US',
  cleanUrls: true,
  lastUpdated: true,

  head: [
    ['link', { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
  ],

  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Resources', link: '/resources' },
      { text: 'Guides', link: '/guides/getting-started' },
    ],

    sidebar: [
      {
        text: 'Start here',
        items: [
          { text: 'Welcome', link: '/' },
          { text: 'Resources', link: '/resources' },
        ],
      },
      {
        text: 'Guides',
        items: [
          { text: 'Getting started', link: '/guides/getting-started' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/' },
    ],

    footer: {
      message: 'Built with VitePress.',
      copyright: 'Released under the MIT License.',
    },

    search: {
      provider: 'local',
    },
  },

  vite: {
    server: {
      host: 'localhost',
      port: 5173,
    },
  },
});
