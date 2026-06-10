/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces (near-black slate, sampled from the product design)
        base: '#08090c',
        surface: {
          DEFAULT: '#0c0e13',
          raised: '#12141a',
          panel: '#161a22',
          hover: '#1d222c',
          line: '#232936',
        },
        ink: {
          DEFAULT: '#eef0f4',
          muted: '#aeb2bd',
          faint: '#777c89',
          ghost: '#565b67',
        },
        // Accents
        accent: {
          DEFAULT: '#2fd39e',
          bright: '#45e3b0',
          dim: '#1f8f6b',
        },
        info: '#4aa3ff',
        violet: '#7c74ff',
        pink: '#f47bd0',
        lime: '#8fd14f',
        danger: '#ff6058',
        amber: '#f5b14b',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 24px -4px rgba(47, 211, 158, 0.45)',
        'glow-danger': '0 0 24px -2px rgba(255, 96, 88, 0.5)',
        panel: '0 8px 30px -12px rgba(0, 0, 0, 0.6)',
      },
      keyframes: {
        'pulse-line': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '1' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'pulse-line': 'pulse-line 1.6s ease-in-out infinite',
        'fade-up': 'fade-up 0.25s ease-out',
      },
    },
  },
  plugins: [],
};
