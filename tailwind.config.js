/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#eef8f4', 100: '#d6eee4', 500: '#20815f', 600: '#17694c', 700: '#14543f', 900: '#102a23' },
        gold: { 400: '#e9b949', 500: '#d89a22' },
      },
      boxShadow: { card: '0 10px 30px rgba(16, 42, 35, 0.08)' },
    },
  },
  plugins: [],
}
