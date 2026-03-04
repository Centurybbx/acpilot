import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        app: {
          bg: '#edf2f7',
          surface: '#ffffff',
          accent: '#1f6feb',
          muted: '#64748b',
          bubble: '#f1f5f9'
        }
      }
    }
  },
  plugins: []
};

export default config;
