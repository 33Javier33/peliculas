import type { Config } from 'tailwindcss'

// Sistema de diseño "Obsidian Sonic" (Carlos P. Nauto Interactive).
// Acentos: violet-500 #8B5CF6 (primario), purple-500 #A855F7 (terciario), emerald-500 #10B981 (lima, reproducción activa).
// Texto: white (alto), slate-400 #94A3B8 (medio), slate-600 #475569 (bajo).
const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // Colores por variables (globals.css): PulsoMusic puede tener su propia paleta
      colors: {
        obsidian: 'rgb(var(--bg) / <alpha-value>)',
        surface: {
          1: 'rgb(var(--surface-1) / <alpha-value>)',
          2: 'rgb(var(--surface-2) / <alpha-value>)',
        },
        violet: { 50: 'rgb(var(--acc-50) / <alpha-value>)', 100: 'rgb(var(--acc-100) / <alpha-value>)', 200: 'rgb(var(--acc-200) / <alpha-value>)', 300: 'rgb(var(--acc-300) / <alpha-value>)', 400: 'rgb(var(--acc-400) / <alpha-value>)', 500: 'rgb(var(--acc-500) / <alpha-value>)', 600: 'rgb(var(--acc-600) / <alpha-value>)', 700: 'rgb(var(--acc-700) / <alpha-value>)', 800: 'rgb(var(--acc-800) / <alpha-value>)', 900: 'rgb(var(--acc-900) / <alpha-value>)', 950: 'rgb(var(--acc-950) / <alpha-value>)' },
        purple: { 50: 'rgb(var(--acc2-50) / <alpha-value>)', 100: 'rgb(var(--acc2-100) / <alpha-value>)', 200: 'rgb(var(--acc2-200) / <alpha-value>)', 300: 'rgb(var(--acc2-300) / <alpha-value>)', 400: 'rgb(var(--acc2-400) / <alpha-value>)', 500: 'rgb(var(--acc2-500) / <alpha-value>)', 600: 'rgb(var(--acc2-600) / <alpha-value>)', 700: 'rgb(var(--acc2-700) / <alpha-value>)', 800: 'rgb(var(--acc2-800) / <alpha-value>)', 900: 'rgb(var(--acc2-900) / <alpha-value>)', 950: 'rgb(var(--acc2-950) / <alpha-value>)' },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-jakarta)', 'var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      opacity: {
        8: '0.08',
        12: '0.12',
        72: '0.72',
      },
      boxShadow: {
        glow: '0 8px 24px rgb(var(--acc-500) / 0.35)',
        rim: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
      },
      keyframes: {
        eq: {
          '0%, 100%': { transform: 'scaleY(1)' },
          '50%': { transform: 'scaleY(0.35)' },
        },
      },
      animation: {
        eq: 'eq 0.9s ease-in-out infinite',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
}

export default config
