import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served at https://www.ask-emy.com (custom domain) — base is "/".
// If you need to preview under github.io/askemy/, set VITE_BASE=/askemy/.
export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
});
