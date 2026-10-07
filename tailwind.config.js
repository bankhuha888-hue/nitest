/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Sarabun', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#effbf7',
          100: '#d6f7ea',
          500: '#18b986',
          600: '#119d77',
          700: '#0b8063'
        }
      }
    },
  },
  plugins: [],
};
