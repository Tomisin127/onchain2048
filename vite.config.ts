import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      // Transparent reverse proxy to BlockRun's x402 AI gateway so the browser
      // talks to a same-origin path (no CORS). Mirrors the Vercel rewrite in
      // vercel.json used in production.
      "/x402/blockrun": {
        target: "https://blockrun.ai/api/v1",
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/x402\/blockrun/, ""),
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
