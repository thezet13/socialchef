/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        flame: {
          "0%, 100%": {
            transform: "scale(1) rotate(0deg)",
            opacity: "0.9",
          },
          "50%": {
            transform: "scale(1.1) rotate(-3deg)",
            opacity: "1",
          },
        },
      },
      animation: {
        flame: "flame 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
