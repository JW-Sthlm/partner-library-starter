import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { initAnalytics } from './analytics';

export default {
  extends: DefaultTheme,
  enhanceApp({ router }) {
    // Browser-only. Safe to call during SSR. initAnalytics short-circuits.
    initAnalytics(router);
  },
} satisfies Theme;
