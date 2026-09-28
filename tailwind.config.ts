import tailwindcssAnimate from 'tailwindcss-animate'
import type { Config } from 'tailwindcss'

/**
 * design_system.md §13.2, merged with the shadcn semantic tokens the rest of
 * the app already consumes. The ramps are static hex on purpose: they are the
 * design system's vocabulary and should mean the same colour in every theme.
 * Anything that must adapt to dark mode uses the semantic tokens instead.
 */
const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './modules/**/*.{ts,tsx}',
  ],
  theme: {
    container: { center: true, padding: '1rem', screens: { '2xl': '1400px' } },
    extend: {
      /** Wired to the next/font instances in app/layout.tsx. */
      fontFamily: {
        sans: ['var(--font-jakarta)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        'display-xl': [
          '60px',
          { lineHeight: '1.02', letterSpacing: '-0.035em', fontWeight: '800' },
        ],
        'display-lg': [
          '48px',
          { lineHeight: '1.05', letterSpacing: '-0.03em', fontWeight: '800' },
        ],
        'display-md': [
          '36px',
          { lineHeight: '1.1', letterSpacing: '-0.025em', fontWeight: '800' },
        ],
        /** Not in the spec's table: the display step phones get instead of 60px. */
        'display-sm': [
          '34px',
          { lineHeight: '1.08', letterSpacing: '-0.025em', fontWeight: '800' },
        ],
        h1: ['30px', { lineHeight: '1.15', letterSpacing: '-0.02em', fontWeight: '700' }],
        h2: [
          '24px',
          { lineHeight: '1.25', letterSpacing: '-0.015em', fontWeight: '700' },
        ],
        h3: ['20px', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '700' }],
        h4: ['17px', { lineHeight: '1.4', letterSpacing: '-0.005em', fontWeight: '600' }],
        'body-lg': ['17px', { lineHeight: '1.6' }],
        body: ['15px', { lineHeight: '1.6' }],
        'body-sm': ['13.5px', { lineHeight: '1.5' }],
        label: ['13px', { lineHeight: '1.4', fontWeight: '600' }],
        'mono-data': ['12.5px', { lineHeight: '1.5', letterSpacing: '0.01em' }],
        stat: ['34px', { lineHeight: '1', letterSpacing: '-0.02em', fontWeight: '700' }],
        eyebrow: [
          '11px',
          { lineHeight: '1.3', letterSpacing: '0.14em', fontWeight: '600' },
        ],
        micro: [
          '11px',
          { lineHeight: '1.4', letterSpacing: '0.01em', fontWeight: '500' },
        ],
      },
      colors: {
        ember: {
          50: '#FEF4ED',
          100: '#FDE6D5',
          200: '#FAC9A9',
          300: '#F7A674',
          400: '#F4883F',
          500: '#F26B24',
          600: '#C24E16',
          700: '#9E3F11',
          800: '#7A300C',
          900: '#561F07',
        },
        teal: {
          50: '#ECF8F6',
          100: '#D2EFE9',
          200: '#A6DFD4',
          300: '#71C9BA',
          400: '#4BB3A2',
          500: '#3A9E8D',
          600: '#2F8172',
          700: '#27685C',
          800: '#1F5149',
          900: '#173B35',
        },
        sand: {
          25: '#FDF7F2',
          50: '#FBF2EA',
          100: '#F6E9DD',
          200: '#EFDCCB',
          300: '#E3CBB4',
          400: '#C9AC90',
        },
        ink: {
          200: '#DDD4C9',
          300: '#C0B5AA',
          400: '#9C9085',
          500: '#7A6E64',
          600: '#5A5048',
          700: '#3D362F',
          800: '#2A2521',
          900: '#1A1613',
          950: '#12100E',
        },
        positive: { DEFAULT: '#3A9E8D', fg: '#27685C' },
        attention: { DEFAULT: '#E8A63C', fg: '#8A5D12' },
        negative: {
          DEFAULT: '#BE4A63',
          fg: '#8F2F44',
          surface: 'hsl(var(--negative-surface))',
        },
        danger: '#B4322E',
        info: '#3A7EA1',

        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        alt: 'hsl(var(--alt))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        /**
         * accent and popover were referenced by button.tsx and
         * dropdown-menu.tsx but never declared here, so `bg-popover` compiled
         * to nothing and the user menu rendered with a transparent background
         * over the page. Declaring them is the fix; nothing else changed.
         */
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        /** Neutral information styling for missing/failed data (§P2). */
        notice: {
          DEFAULT: 'hsl(var(--notice))',
          surface: 'hsl(var(--notice-surface))',
        },
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',
        md: '8px',
        lg: '10px',
        xl: '14px',
        '2xl': '20px',
        /** Named for what they wrap, so §5.2's table is readable in the markup. */
        card: 'var(--radius-card)',
        control: 'var(--radius-control)',
        chip: 'var(--radius-chip)',
      },
      boxShadow: {
        xs: '0 1px 2px rgba(26,22,19,.05)',
        sm: '0 2px 8px rgba(26,22,19,.07)',
        md: '0 8px 24px rgba(26,22,19,.10)',
        lg: '0 20px 48px rgba(26,22,19,.14)',
        card: 'var(--shadow-card)',
        overlay: 'var(--shadow-overlay)',
      },
      backgroundImage: {
        'grad-primary': 'var(--grad-primary)',
        'grad-primary-hover': 'var(--grad-primary-hover)',
        'grad-primary-bright': 'var(--grad-primary-bright)',
        'grad-banner': 'var(--grad-banner)',
        'grad-sidebar': 'var(--grad-sidebar)',
        'grad-hero-glow': 'var(--grad-hero-glow)',
        'grad-stat-teal': 'var(--grad-stat-teal)',
        'grad-stat-ember': 'var(--grad-stat-ember)',
        'grad-divider': 'var(--grad-divider)',
      },
      maxWidth: {
        spine: '680px',
        data: '1100px',
        shell: '1180px',
        landing: '1200px',
        narrative: 'var(--spine-narrative)',
        wide: 'var(--spine-wide)',
      },
      spacing: {
        sidebar: '288px',
      },
      transitionDuration: {
        instant: '100ms',
        fast: '160ms',
        base: '220ms',
        slow: '340ms',
        chart: '600ms',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(.2,0,.2,1)',
        soft: 'cubic-bezier(.16,1,.3,1)',
      },
      keyframes: {
        /** Chart bars grow from their baseline rather than fading in. */
        'grow-x': {
          from: { transform: 'scaleX(0)' },
          to: { transform: 'scaleX(1)' },
        },
        rise: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'none' },
        },
        fade: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        shimmer: {
          from: { backgroundPosition: '150% 0' },
          to: { backgroundPosition: '-50% 0' },
        },
        /** Watermelon UI's marquee: one copy's width plus the gap, then loop. */
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(calc(-100% - var(--gap)))' },
        },
      },
      animation: {
        'grow-x': 'grow-x 600ms cubic-bezier(.16,1,.3,1) forwards',
        marquee: 'marquee var(--duration) linear infinite',
      },
    },
  },
  // Imported, not require()d: this file is an ES module, and Node >= 22 loads
  // it through loadESMFromCJS, where `require` is not defined at all.
  plugins: [tailwindcssAnimate],
}

export default config
