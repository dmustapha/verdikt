import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        court: {
          bg: '#0a0a0f',
          panel: '#12121a',
          border: '#1e1e2e',
          gold: '#d4a843',
          green: '#22c55e',
          red: '#ef4444',
          blue: '#3b82f6',
          purple: '#a855f7',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-down': 'slideDown 0.5s ease-out',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 5px rgba(212, 168, 67, 0.3)' },
          '50%': { boxShadow: '0 0 20px rgba(212, 168, 67, 0.6)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
