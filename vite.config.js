import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// When deployed to https://<user>.github.io/askemy/ the base must match.
// A custom domain later will use "/" — flip VITE_BASE=/ on the workflow.
export default defineConfig({
  base: process.env.VITE_BASE ?? "/askemy/",
  plugins: [react()],
});
