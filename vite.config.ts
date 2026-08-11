import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // "prompt", not "autoUpdate": autoUpdate silently serves the cached build
      // to an already-open tab, so a long-lived tab can sit several releases
      // behind with no signal. We register manually (see pwa/useAppUpdate.ts)
      // and ask before reloading — a surprise reload mid-entry loses a
      // half-typed expense.
      registerType: "prompt",
      injectRegister: null,
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Greenline — Monthly Budget",
        short_name: "Greenline",
        description: "A private monthly budget tracker. Your data is secured to your own account.",
        theme_color: "#0E1512",
        background_color: "#0E1512",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" }
        ]
      },
      workbox: {
        // Fonts are self-hosted (woff2) and precached below — no runtime font cache needed.
        globPatterns: ["**/*.{js,css,html,svg,woff2}"]
      }
    })
  ],
  build: { sourcemap: false, chunkSizeWarningLimit: 900 },
  test: {
    environment: "node",
    exclude: ["e2e/**", "node_modules/**", "dist/**"]
  }
} as never);
