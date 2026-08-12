import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // We register the worker ourselves (see pwa/useAppUpdate.ts) and show a
      // banner rather than reloading unasked — a surprise reload mid-entry
      // loses a half-typed expense. injectRegister: null keeps the plugin from
      // also injecting its own registration script.
      //
      // registerType has no effect while injectRegister is null; it only
      // shapes the script we're opting out of. Left as "prompt" to state the
      // intent, not because it does anything.
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
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        // The new worker takes over as soon as it installs, and the page says so
        // rather than reloading on its own.
        //
        // Letting it WAIT instead is the textbook choice, but it stranded people:
        // a tab whose page code predates the banner has nothing that can ever
        // activate the waiting worker, so no amount of reloading recovers it —
        // only closing every tab does. Measured, not assumed.
        skipWaiting: true,
        clientsClaim: true
      }
    })
  ],
  build: { sourcemap: false, chunkSizeWarningLimit: 900 },
  test: {
    environment: "node",
    exclude: ["e2e/**", "node_modules/**", "dist/**"]
  }
} as never);
