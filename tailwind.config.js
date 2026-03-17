/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        green: {
          50: '#f0faf4', 100: '#d6f0e0', 200: '#a7dcbc',
          300: '#71c49a', 400: '#3ea872', 500: '#2d7a50',
          600: '#1e5c3a', 700: '#164530', 800: '#0f3022', 900: '#081a12'
        }
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"DM Mono"', 'monospace']
      }
    }
  },
  plugins: []
}
