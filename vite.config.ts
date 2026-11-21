import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Builds a Cloudflare Worker: dist/server/server.js (the app) + dist/client (static files).
export default defineConfig({
  ssr: {
    noExternal: true,
    external: ["cloudflare:workers"],
  },
  build: {
    rollupOptions: { external: [/^cloudflare:/] },
  },
  plugins: [tanstackStart({ server: { entry: "server" } }), react(), tsconfigPaths()],
});
