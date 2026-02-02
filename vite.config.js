import { defineConfig } from "vite";
import { resolve } from "path";
import { readdirSync, statSync } from "fs";

// Auto-discover visualization pages in src/
function getVisualizationInputs() {
  const inputs = {
    main: resolve(__dirname, "index.html"),
  };

  const srcDir = resolve(__dirname, "src");
  try {
    for (const entry of readdirSync(srcDir)) {
      const entryPath = resolve(srcDir, entry);
      if (
        statSync(entryPath).isDirectory() &&
        readdirSync(entryPath).includes("index.html")
      ) {
        inputs[entry] = resolve(entryPath, "index.html");
      }
    }
  } catch {
    // src/ may not exist yet
  }

  return inputs;
}

export default defineConfig({
  build: {
    rollupOptions: {
      input: getVisualizationInputs(),
    },
  },
});
