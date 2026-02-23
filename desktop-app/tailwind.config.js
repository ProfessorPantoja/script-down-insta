/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'insta-primary': '#E1306C',
        'app-bg': '#0f172a',
        'app-surface': '#1e293b',
      }
    },
  },
  plugins: [],
}
