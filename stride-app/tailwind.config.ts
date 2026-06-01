import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'hsl(var(--color-bg))',
        surface: {
          DEFAULT: 'hsl(var(--color-surface))',
          soft: 'hsl(var(--color-surface-soft))',
        },
        ink: {
          DEFAULT: 'hsl(var(--color-text))',
          muted: 'hsl(var(--color-text-muted))',
        },
        primary: {
          DEFAULT: 'hsl(var(--color-primary))',
          foreground: 'hsl(var(--color-primary-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--color-accent))',
          foreground: 'hsl(var(--color-accent-foreground))',
        },
        warm: 'hsl(var(--color-warm-accent))',
        line: 'hsl(var(--color-border))',
        danger: 'hsl(var(--color-danger))',
        success: 'hsl(var(--color-success))',
        warning: 'hsl(var(--color-warning))',
        info: 'hsl(var(--color-info))',
        footer: 'hsl(var(--color-footer))',
      },
      fontFamily: {
        sans: ['var(--font-manrope)', 'sans-serif'],
        display: ['var(--font-unbounded)', 'sans-serif'],
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
