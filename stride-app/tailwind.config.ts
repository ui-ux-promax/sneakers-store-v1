import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    // lib/ задаёт классы строкой (напр. badge-статусы в lib/order.ts) — без скана
    // Tailwind выпилит .badge-* из @layer components как «неиспользуемые».
    './lib/**/*.{js,ts}',
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
        admin: {
          bg: 'var(--admin-bg)',
          surface: 'var(--admin-surface)',
          'surface-low': 'var(--admin-surface-low)',
          'surface-container': 'var(--admin-surface-container)',
          'surface-high': 'var(--admin-surface-high)',
          'on-bg': 'var(--admin-on-bg)',
          'on-surface': 'var(--admin-on-surface)',
          'on-surface-variant': 'var(--admin-on-surface-variant)',
          primary: 'var(--admin-primary)',
          'on-primary': 'var(--admin-on-primary)',
          'secondary-container': 'var(--admin-secondary-container)',
          'on-secondary-container': 'var(--admin-on-secondary-container)',
          error: 'var(--admin-error)',
          'on-error': 'var(--admin-on-error)',
          outline: 'var(--admin-outline)',
          'outline-variant': 'var(--admin-outline-variant)',
        },
      },
      fontFamily: {
        sans: ['var(--font-manrope)', 'sans-serif'],
        display: ['var(--font-unbounded)', 'sans-serif'],
        'admin-head': ['var(--font-anybody)', 'sans-serif'],
        'admin-body': ['var(--font-manrope)', 'sans-serif'],
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
