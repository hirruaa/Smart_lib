/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: {
          50: '#ffffff',
          100: '#f6f8fb',
          200: '#e9edf3',
          300: '#d6deea',
          400: '#bbc8d8',
        },
        forest: {
          800: '#16385b',
          900: '#0b2447',
          950: '#071a35',
        },
        pine: {
          50: '#eff6f0',
          100: '#deeadf',
          200: '#b8d0bb',
          500: '#397451',
          600: '#28603e',
          700: '#1e5128',
        },
        warmGold: {
          400: '#f4dc50',
          500: '#fcd900',
        }
      },
    },
  },
  plugins: [],
}
