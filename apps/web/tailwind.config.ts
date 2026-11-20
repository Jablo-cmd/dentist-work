import type { Config } from 'tailwindcss';

const v = (name: string) => `hsl(var(--${name}))`;

/** Colours resolve to CSS variables in src/app/globals.css (the token source of truth). */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: v('background'),
        foreground: v('foreground'),
        muted: { DEFAULT: v('muted'), foreground: v('muted-foreground') },
        accent: { DEFAULT: v('accent'), foreground: v('accent-foreground') },
        card: { DEFAULT: v('card'), foreground: v('card-foreground') },
        border: v('border'),
        input: v('input'),
        ring: v('ring'),
        forest: v('forest'),
        brand: v('brand'),
        primary: {
          DEFAULT: v('primary'),
          hover: v('primary-hover'),
          foreground: v('primary-foreground'),
        },
        sidebar: {
          DEFAULT: v('sidebar'),
          foreground: v('sidebar-foreground'),
          active: v('sidebar-active'),
          muted: v('sidebar-muted'),
        },
        success: { DEFAULT: v('success'), soft: v('success-soft') },
        warning: { DEFAULT: v('warning'), soft: v('warning-soft') },
        danger: { DEFAULT: v('danger'), soft: v('danger-soft') },
        info: { DEFAULT: v('info'), soft: v('info-soft') },
      },
      borderRadius: { lg: '0.625rem', md: '0.5rem', sm: '0.375rem' },
      boxShadow: {
        card: '0 1px 2px 0 hsl(154 30% 20% / 0.05)',
        pop: '0 8px 24px -6px hsl(154 30% 15% / 0.18)',
      },
      fontFamily: {
        sans: [
          '"Inter Variable"',
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
export default config;
