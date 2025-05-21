// tailwind.config.js
module.exports = {
  darkMode: 'class', // Enable class-based dark mode
  content: [
    './**/*.html', // Scan all HTML files
    './**/*.js',   // Scan all JavaScript files
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
        dark: {
          'bg-primary': '#111827',
          'bg-secondary': '#1F2937',
          'text-primary': '#F3F4F6',
          'text-secondary': '#D1D5DB',
        }
      }
    },
  },
  plugins: [],
}