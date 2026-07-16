/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./App.tsx",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./constants.ts",
  ],
  safelist: [
    // Rarity borders
    'border-[#61fa79]',
    'border-[#0095ff]',
    'border-[#a335ee]',
    'border-[#ff8000]',
    'border-[#e5cc80]',
    'border-transparent',
    // Rarity backgrounds (for active/hover item tabs)
    'bg-[#61fa79]/20',
    'bg-[#0095ff]/20',
    'bg-[#a335ee]/20',
    'bg-[#ff8000]/20',
    'bg-[#e5cc80]/20',
    'bg-[#61fa79]/40',
    'bg-[#0095ff]/40',
    'bg-[#a335ee]/40',
    'bg-[#ff8000]/40',
    'bg-[#e5cc80]/40',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
