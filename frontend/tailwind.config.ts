import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        court: {
          bg: '#0a0a0f',
          'bg-elevated': '#0e0e16',
          panel: '#12121a',
          'panel-hover': '#16161f',
          surface: '#1a1a24',
          border: '#1e1e2e',
          'border-subtle': '#16162a',
          'border-accent': '#2a2a3e',
          gold: '#d4a843',
          'gold-dim': '#a07c2e',
          'gold-bright': '#f0c95e',
          green: '#22c55e',
          'green-dim': '#166534',
          red: '#ef4444',
          'red-dim': '#7f1d1d',
          yellow: '#eab308',
          'yellow-dim': '#713f12',
          blue: '#3b82f6',
          purple: '#a855f7',
          'text-primary': '#e8e8ec',
          'text-secondary': '#9898a8',
          'text-muted': '#5a5a6e',
        },
      },
      animation: {
        'vk-fade-in': 'vk-fade-in 0.4s var(--ease-out)',
        'vk-slide-down': 'vk-slide-down 0.4s var(--ease-out)',
        'vk-pulse-glow': 'vk-pulse-glow 2.5s ease-in-out infinite',
        'vk-scale-in': 'vk-scale-in 0.35s var(--ease-spring)',
        'vk-verdict-stamp': 'vk-verdict-stamp 0.5s var(--ease-spring)',
        'vk-shimmer': 'vk-shimmer 2s infinite linear',
      },
      keyframes: {
        'vk-fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'vk-slide-down': {
          from: { opacity: '0', transform: 'translateY(-12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'vk-pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 4px rgba(212, 168, 67, 0.15)' },
          '50%': { boxShadow: '0 0 16px rgba(212, 168, 67, 0.35)' },
        },
        'vk-scale-in': {
          from: { opacity: '0', transform: 'scale(0.92)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'vk-verdict-stamp': {
          '0%': { opacity: '0', transform: 'scale(2) rotate(-8deg)' },
          '60%': { opacity: '1', transform: 'scale(0.95) rotate(1deg)' },
          '100%': { opacity: '1', transform: 'scale(1) rotate(0deg)' },
        },
        'vk-shimmer': {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
      borderRadius: {
        sm: '4px',
        md: '6px',
        lg: '10px',
      },
    },
  },
  plugins: [],
};

export default config;
