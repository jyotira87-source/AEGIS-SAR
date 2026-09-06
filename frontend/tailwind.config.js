/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          950: "#0B0F19",
          900: "#111827",
          850: "#131A2A",
          800: "#1E293B",
        },
        emerald: {
          500: "#10B981",
          400: "#34D399",
          300: "#6EE7B7",
        },
        amber: {
          500: "#F59E0B",
          400: "#FBBF24",
          300: "#FCD34D",
        },
        cyan: {
          400: "#22D3EE",
          300: "#67E8F9",
        },
        crimson: {
          500: "#EF4444",
          400: "#F87171",
        },
      },
      boxShadow: {
        "glow-emerald": "0 0 20px rgba(16, 185, 129, 0.35)",
        "glow-cyan": "0 0 20px rgba(34, 211, 238, 0.35)",
        "glow-amber": "0 0 20px rgba(245, 158, 11, 0.35)",
        "glow-crimson": "0 0 20px rgba(239, 68, 68, 0.45)",
        "glow-soft": "0 8px 40px rgba(0, 0, 0, 0.45)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Courier New", "monospace"],
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(rgba(34,211,238,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.05) 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "40px 40px",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "spin-slow": "spin 8s linear infinite",
        float: "float 6s ease-in-out infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-12px)" },
        },
      },
    },
  },
  plugins: [],
};