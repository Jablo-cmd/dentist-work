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
      fontSize: {
        xs: ['0.8125rem', { lineHeight: '1.15rem' }],
        sm: ['0.9375rem', { lineHeight: '1.4rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.125rem', { lineHeight: '1.6rem', letterSpacing: '-0.012em' }],
        xl: ['1.375rem', { lineHeight: '1.8rem', letterSpacing: '-0.018em' }],
        '2xl': ['1.75rem', { lineHeight: '2.2rem', letterSpacing: '-0.025em' }],
        '3xl': ['2.125rem', { lineHeight: '2.5rem', letterSpacing: '-0.03em' }],
      },
      borderRadius: { lg: '0.75rem', md: '0.5rem', sm: '0.375rem', xl: '1rem' },
      boxShadow: {
        card: '0 1px 2px 0 hsl(154 40% 16% / 0.05), 0 6px 20px -8px hsl(154 40% 16% / 0.10)',
        pop: '0 12px 32px -8px hsl(154 40% 12% / 0.28)',
        inset: 'inset 0 1px 0 0 hsl(0 0% 100% / 0.16)',
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
