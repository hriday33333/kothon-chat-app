/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1b2430',
        paper: '#f4f6f5',
        brand: { DEFAULT: 'rgb(var(--brand-rgb) / <alpha-value>)', dark: 'rgb(var(--brand-rgb) / <alpha-value>)', soft: 'rgb(var(--brand-rgb) / 0.14)' },
      },
    },
  },
  plugins: [],
};
