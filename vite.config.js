import { existsSync, statSync } from "fs";
import { defineConfig } from "vite";

var musicPath = "public/audio/background.mp3";
var musicVersion = existsSync(musicPath)
  ? String(Math.floor(statSync(musicPath).mtimeMs))
  : "0";

export default defineConfig({
  base: "/",
  define: {
    __MUSIC_VERSION__: JSON.stringify(musicVersion),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
  },
});
