import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages poslužuje aplikaciju na /nisaradar/; lokalno (npm run dev) radi na korijenu.
export default defineConfig(({ command, isPreview }) => ({
  plugins: [react()],
  base: command === "build" || isPreview ? "/nisaradar/" : "/",
}));
