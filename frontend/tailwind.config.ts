import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx,html}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx,html}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx,html}",
    "./public/**/*.html",
  ],
  theme: {
    extend: {
      fontFamily: {
        ui: ["var(--nc-font-ui)"],
        data: ["var(--nc-font-data)"],
      },
      colors: {
        nc: {
          base: "rgb(var(--nc-base) / <alpha-value>)",
          raised: "rgb(var(--nc-raised) / <alpha-value>)",
          panel: "rgb(var(--nc-panel) / <alpha-value>)",
          "panel-2": "rgb(var(--nc-panel-2) / <alpha-value>)",
          line: "rgb(var(--nc-line) / <alpha-value>)",
          "line-strong": "rgb(var(--nc-line-strong) / <alpha-value>)",
          hi: "rgb(var(--nc-hi) / <alpha-value>)",
          mid: "rgb(var(--nc-mid) / <alpha-value>)",
          lo: "rgb(var(--nc-lo) / <alpha-value>)",
          cyan: "rgb(var(--nc-cyan) / <alpha-value>)",
          ok: "rgb(var(--nc-ok) / <alpha-value>)",
          warn: "rgb(var(--nc-warn) / <alpha-value>)",
          bad: "rgb(var(--nc-bad) / <alpha-value>)",
        },
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
};
export default config;
