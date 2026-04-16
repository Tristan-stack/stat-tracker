import type { KnipConfig } from 'knip';

/** Knip ne voit pas les imports CSS (`tw-animate-css`) ni la chaîne PostCSS/Tailwind v4. */
const config: KnipConfig = {
  ignoreDependencies: ['tw-animate-css', 'tailwindcss'],
  rules: {
    exports: 'off',
    types: 'off',
  },
};

export default config;
