/**
 * stockflow design system — Tailwind binding.
 *
 * Every colour resolves to a CSS variable defined in src/styles/tokens.css, so the
 * palette lives in ONE place. `theme.colors` is REPLACED (not extended): Tailwind's
 * default palette (blue, indigo, slate…) is unavailable, so stray off-brand classes
 * simply don't compile.
 *
 *   ink      neutrals (warm Desert Sand tints → Blue Slate #495867 at 700)
 *   brand    Dusty Rose #CE796B (500) — primary accent; 300 = Powder Blush
 *   sand     Desert Sand #ECC8AF (300) — soft surfaces
 *   blush    Powder Blush #E7AD99 (300) — hover / selected backgrounds
 *   almond   Toasted Almond #C18C5D (500) — secondary accent
 *   success / warning / danger / info — functional status colours
 *
 * @type {import('tailwindcss').Config}
 */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const scale = (name, steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]) =>
  Object.fromEntries(steps.map((s) => [s, v(`${name}-${s}`)]));

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',
      white: '#ffffff',
      black: '#000000',
      ink: scale('ink', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]),
      brand: scale('brand', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]),
      sand: scale('sand'),
      blush: scale('blush'),
      almond: scale('almond'),
      success: scale('success'),
      warning: scale('warning'),
      danger: scale('danger'),
      info: scale('info'),
      // Semantic aliases
      canvas: v('color-background'),
      surface: { DEFAULT: v('color-surface'), hover: v('color-surface-hover'), muted: v('color-surface-muted') },
      primary: { DEFAULT: v('color-primary'), hover: v('color-primary-hover') },
      accent: v('color-accent'),
      sidebar: v('color-sidebar'),
    },
    extend: {
      fontFamily: {
        // Only the two brand fonts. `mono` (used for SKUs / order numbers) maps to the body font.
        sans: ['var(--font-body)'],
        display: ['var(--font-heading)'],
        mono: ['var(--font-body)'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderColor: {
        DEFAULT: v('color-border'),
      },
      ringColor: {
        DEFAULT: v('color-accent'),
      },
      boxShadow: {
        card: '0 1px 2px rgb(var(--ink-900) / 0.04), 0 1px 3px rgb(var(--ink-900) / 0.06)',
        pop: '0 16px 40px -12px rgb(var(--ink-900) / 0.28), 0 2px 6px rgb(var(--ink-900) / 0.06)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        'slide-in-right': { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
        'slide-in-left': { from: { transform: 'translateX(-100%)' }, to: { transform: 'none' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'slide-up': 'slide-up 160ms ease-out',
        'slide-in-right': 'slide-in-right 200ms ease-out',
        'slide-in-left': 'slide-in-left 200ms ease-out',
        float: 'float 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
