const config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'surface-0': 'var(--surface-0)',
        'surface-1': 'var(--surface-1)',
        'surface-2': 'var(--surface-2)',
        'txt-1': 'var(--text-1)',
        'txt-2': 'var(--text-2)',
        'txt-3': 'var(--text-3)',
        'border-main': 'var(--border-main)',
        /* aliases */
        'text-1': 'var(--text-1)',
        'text-2': 'var(--text-2)',
        'text-3': 'var(--text-3)',
        'dilly-blue': '#3B4CC0',
        'dilly-blue-light': '#5B6CD0',
        'dilly-gold': '#C9A84C',
        'dilly-green': '#34C759',
        'dilly-amber': '#FF9F0A',
        'dilly-red': '#FF453A',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        serif: ['Cinzel', 'Georgia', 'serif'],
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
module.exports = config;
