/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#0A0A0A',
          card: '#121212',
          border: '#2A2A2A',
        },
        pastel: {
          red: '#FF8A80',
          green: '#B9F6CA',
          blue: '#82B1FF',
          purple: '#D1C4E9',
        }
      },
      fontFamily: {
        // This overrides the default 'mono' font with Space Mono
        mono: ['var(--font-space-mono)', 'monospace'],
        // Optional: If you want it for 'sans' too (complete mono look)
        sans: ['var(--font-space-mono)', 'monospace'], 
      }
    },
  },
  plugins: [],
};