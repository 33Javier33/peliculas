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
      colors: {
        obsidian: '#0B0C10',
        surface: {
          1: '#16181F',
          2: '#1F222E',
        },
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
        glow: '0 8px 24px rgba(139, 92, 246, 0.35)',
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
