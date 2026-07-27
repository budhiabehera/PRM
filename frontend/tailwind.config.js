/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        indigo: {
          600: '#4f46e5',
          700: '#4338ca',
        },
      },
      fontFamily: {
        mono: ['SF Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
