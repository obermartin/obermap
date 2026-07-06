/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'status-unknown': '#F15A38',
        'status-liberated': '#317FE0',
        'status-occupied': '#C91D2C',
        'status-cadr': '#AB1926',
        'status-crimea': '#AB1926',
      },
      fontFamily: {
        sans: ['Roboto', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
