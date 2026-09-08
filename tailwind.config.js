/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: {
          50: '#fcfbf7',
          100: '#f5f1e8',
          200: '#e9e4d7',
          300: '#e2ded4',
          400: '#d0cec2',
        },
        forest: {
          800: '#2d4b45',
          900: '#263f3a',
          950: '#1b2d29',
        },
        pine: {
          50: '#f2f7f4',
          100: '#dde5de',
          200: '#b5c9b8',
          500: '#78938a',
          600: '#526f65',
          700: '#40534a',
        },
        warmGold: {
          400: '#d0ad78',
          500: '#b28a5a',
        }
      },
    },
  },
  plugins: [],
}
