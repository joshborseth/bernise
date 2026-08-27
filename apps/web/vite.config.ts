import { defineConfig, lazyPlugins } from "vite-plus";
import react from "@vitejs/plugin-react";

const port = Number(process.env.PORT ?? 5733);
const backendPort = Number(process.env.BERNISE_PORT ?? 13773);
const explicitHost = process.env.HOST?.trim();
const host = explicitHost || "localhost";
const backendTarget = `http://localhost:${String(backendPort)}`;

export default defineConfig({
  plugins: lazyPlugins(() => [react()]),
  server: {
    host,
    port,
    strictPort: true,
    open: process.env.BERNISE_NO_BROWSER === "0",
    proxy: {
      "/health": {
        target: backendTarget,
      },
      "/rpc": {
        target: backendTarget,
        ws: true,
      },
    },
    ...(explicitHost
      ? {
          hmr: {
            protocol: "ws",
            host: explicitHost,
            clientPort: port,
          },
        }
      : {}),
  },
});
