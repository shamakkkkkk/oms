/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#dbe6fe',
          500: '#3b5bdb',
          600: '#2f4bc7',
          700: '#2a3fa3',
        },
      },
    },
  },
  plugins: [],
};
