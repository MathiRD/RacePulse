import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        asphalt: '#070A12',
        carbon: '#0D1220',
        neon: '#6EE7B7',
        violetRace: '#8B5CF6',
        amberRace: '#F59E0B'
      },
      boxShadow: {
        glass: '0 24px 80px rgba(0,0,0,.22)'
      }
    },
  },
  plugins: [],
};
export default config;
