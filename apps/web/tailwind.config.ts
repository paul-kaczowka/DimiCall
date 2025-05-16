export default {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'oklch(var(--primary))',
        // ajoute quelques tokens OKLCH…
      },
    },
  },
} 