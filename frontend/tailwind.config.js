/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        forest: {
          DEFAULT: '#1E4D2B',
          light: '#2D6A3F',
          dark: '#143620',
        },
        sienna: {
          DEFAULT: '#C0522B',
          light: '#D97B5C',
          dark: '#9A3D1F',
        },
        earth: {
          DEFAULT: '#C8781A',
          light: '#E09A3E',
          dark: '#9A5D14',
        },
        sage: {
          DEFAULT: '#A8C5A0',
          light: '#C4D9BF',
          dark: '#7BA872',
        },
        amber: {
          DEFAULT: '#F59E0B',
          light: '#FCD34D',
          dark: '#D97706',
        },
        alert: {
          DEFAULT: '#DC2626',
          light: '#EF4444',
          dark: '#B91C1C',
        },
        cream: {
          DEFAULT: '#FAF9F6',
          dark: '#F5F5F0',
        },
      },
      fontFamily: {
        serif: ['Playfair Display', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        card: '16px',
        input: '8px',
        pill: '9999px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)',
        'card-dark': '0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)',
        elevated: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
        navbar: '0 1px 0 rgba(0,0,0,0.05)',
        modal: '0 25px 50px -12px rgba(0,0,0,0.25)',
      },
      animation: {
        'pulse-slow': 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}
