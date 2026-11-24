/** @type {import('tailwindcss').Config} */
const config = {
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--bg-canvas)',
        surface: 'var(--bg-surface)',
        blueprint: 'var(--bg-blueprint)',
        'blueprint-dark': 'var(--bg-blueprint-dark)',
        line: 'var(--border-subtle)',
        'line-strong': 'var(--border-strong)',
        ink: 'var(--text-primary)',
        'ink-secondary': 'var(--text-secondary)',
        'ink-muted': 'var(--text-muted)',
        signal: 'var(--accent-signal)',
        'signal-hover': 'var(--accent-signal-hover)',
        'fit-flat': 'var(--fit-flat)',
        'fit-balls': 'var(--fit-balls)',
        'fit-tiptoe': 'var(--fit-tiptoe)',
        'fit-unsafe': 'var(--fit-unsafe)',
        ghost: '#0284C7',
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      borderRadius: {
        sm: '4px',
        md: '6px',
      },
    },
  },
  plugins: [],
};

export default config;
