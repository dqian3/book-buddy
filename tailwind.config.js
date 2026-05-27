/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        reading: ['"Noto Serif SC"', "Georgia", "PMingLiU", "serif"],
      },
    },
  },
  plugins: [],
};
