/* Shared Tailwind CDN config — marketing site (dark, aligned with Dilly app) */
tailwind.config = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        /* Cinzel: display / editorial — use sparingly with font-semibold, tracking */
        serif: ['Cinzel', 'Georgia', 'serif'],
      },
      colors: {
        surface: '#0a0a0a',
        raised: '#111113',
        card: '#1c1c1e',
        ink: '#fafafa',
        muted: '#a1a1aa',
        line: '#27272a',
        gold: '#c5a353',
        appgreen: '#34d399',
        brand: '#818cf8',
        brand2: '#6366f1',
      },
      boxShadow: {
        soft: '0 22px 50px -12px rgba(0, 0, 0, 0.45)',
        softer: '0 12px 40px -16px rgba(52, 211, 153, 0.12)',
        card: '0 4px 24px rgba(0, 0, 0, 0.35)',
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        'fade-up': 'fadeUp 0.8s ease-out forwards',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-14px)' },
        },
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
};
