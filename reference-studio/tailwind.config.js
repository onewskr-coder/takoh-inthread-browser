/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{js,ts,jsx,tsx,html}',
    './*.html'
  ],
  theme: {
    extend: {
      colors: {
        cheat: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
        brand: {
          purple: '#8b5cf6',
          dark: '#0f172a',
          card: '#1e293b'
        }
      }
    },
  },
  plugins: [],
};
