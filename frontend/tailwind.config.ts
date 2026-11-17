/** Tailwind CSS config — every token from DESIGN.md's frontmatter.
 *
 * Colors, typography, rounded, and spacing are NOT hardcoded in components;
 * they're defined here as custom theme values so the design system stays
 * single-source-of-truth.
 *
 * Source: terra_kenya_market_intelligence/DESIGN.md frontmatter.
 */
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // ---- Colors (DESIGN.md colors frontmatter) ----
      colors: {
        surface: '#fff8f4',
        'surface-dim': '#e1d8d1',
        'surface-bright': '#fff8f4',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#fbf2ea',
        'surface-container': '#f6ece4',
        'surface-container-high': '#f0e7df',
        'surface-container-highest': '#eae1d9',
        'on-surface': '#1f1b16',
        'on-surface-variant': '#574238',
        'inverse-surface': '#34302b',
        'inverse-on-surface': '#f8efe7',
        outline: '#8a7266',
        'outline-variant': '#dec1b3',
        'surface-tint': '#9d4400',
        primary: '#9d4400',
        'on-primary': '#ffffff',
        'primary-container': '#e8742a',
        'on-primary-container': '#4f1f00',
        'inverse-primary': '#ffb68f',
        secondary: '#6a5b56',
        'on-secondary': '#ffffff',
        'secondary-container': '#f3ded7',
        'on-secondary-container': '#70615c',
        tertiary: '#006d3b',
        'on-tertiary': '#ffffff',
        'tertiary-container': '#3ba868',
        'on-tertiary-container': '#00361a',
        error: '#ba1a1a',
        'on-error': '#ffffff',
        'error-container': '#ffdad6',
        'on-error-container': '#93000a',
        'primary-fixed': '#ffdbca',
        'primary-fixed-dim': '#ffb68f',
        'on-primary-fixed': '#331100',
        'on-primary-fixed-variant': '#773200',
        'secondary-fixed': '#f3ded7',
        'secondary-fixed-dim': '#d6c3bc',
        'on-secondary-fixed': '#241915',
        'on-secondary-fixed-variant': '#51443f',
        'tertiary-fixed': '#8df9b0',
        'tertiary-fixed-dim': '#71dc96',
        'on-tertiary-fixed': '#00210e',
        'on-tertiary-fixed-variant': '#00522b',
        background: '#fff8f4',
        'on-background': '#1f1b16',
        'surface-variant': '#eae1d9',
        // Market valuation status signals (DESIGN.md prose section)
        'market-opportunity': '#2F9E5F',
        'market-overvalued': '#D6455D',
        'market-caution': '#E3A008',
        'market-neutral': '#6B7A90',
        // Earth Accent Scale (DESIGN.md prose Colors section) — used for precise
        // button hover/active states. The frontmatter's primary/primary-container
        // tokens cover the "Main" and "Container" variants; these add the
        // "Dark" (hover) and "Deep" (pressed) variants the prose specifies for
        // Primary Action Button states.
        'earth-dark': '#B04A0E',
        'earth-deep': '#7A3208',
        // Canvas cool slate (DESIGN.md prose Palette Architecture: "Canvas Base: #EEF0F3")
        // Used for the mobile header backdrop per mobile design code.html.
        'canvas-cool': '#EEF0F3',
      },
      // ---- Border radius (DESIGN.md rounded frontmatter) ----
      borderRadius: {
        sm: '0.5rem',
        DEFAULT: '1rem',
        md: '1.5rem',
        lg: '2rem',
        xl: '3rem',
        full: '9999px',
      },
      // ---- Spacing (DESIGN.md spacing frontmatter) ----
      spacing: {
        gutter: '1.5rem',
        'gutter-mobile': '1rem',
        margin: '2rem',
        'margin-mobile': '1rem',
        'space-xs': '0.375rem',
        'space-sm': '0.75rem',
        'space-md': '1.25rem',
        'space-lg': '1.75rem',
        'space-xl': '2.5rem',
      },
      // ---- Typography (DESIGN.md typography frontmatter) ----
      fontFamily: {
        outfit: ['Outfit', 'sans-serif'],
      },
      fontSize: {
        'display-kpi': ['48px', { lineHeight: '52px', letterSpacing: '-0.03em', fontWeight: '300' }],
        'display-kpi-mobile': ['38px', { lineHeight: '42px', letterSpacing: '-0.02em', fontWeight: '300' }],
        'headline-page': ['38px', { lineHeight: '46px', letterSpacing: '-0.02em', fontWeight: '300' }],
        'headline-page-mobile': ['30px', { lineHeight: '36px', letterSpacing: '-0.01em', fontWeight: '300' }],
        'headline-section': ['22px', { lineHeight: '28px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'title-card': ['18px', { lineHeight: '24px', fontWeight: '500' }],
        'body-regular': ['15px', { lineHeight: '22px', fontWeight: '400' }],
        'body-medium': ['15px', { lineHeight: '22px', fontWeight: '500' }],
        'label-uppercase': ['13px', { lineHeight: '16px', letterSpacing: '0.06em', fontWeight: '500' }],
        'label-metric': ['13px', { lineHeight: '18px', letterSpacing: '0.01em', fontWeight: '500' }],
        'caption-sm': ['11px', { lineHeight: '14px', letterSpacing: '0.02em', fontWeight: '400' }],
      },
      // ---- Shadows (DESIGN.md Elevation & Depth section) ----
      boxShadow: {
        'level-1': '0 1px 2px rgba(27,21,18,0.02), 0 8px 24px -4px rgba(27,21,18,0.04)',
        'level-2': '0 4px 6px -1px rgba(27,21,18,0.03), 0 16px 32px -6px rgba(27,21,18,0.07)',
        'level-3': '0 4px 14px rgba(27,21,18,0.08)',
        'rail-button': '0 2px 8px rgba(27,21,18,0.06)',
      },
    },
  },
  plugins: [],
} satisfies Config;
