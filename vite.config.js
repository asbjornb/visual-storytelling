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

// Strip "src/" prefix from output paths so visualizations are served
// at /us-territorial-expansion/ instead of /src/us-territorial-expansion/
function stripSrcPrefix() {
  return {
    name: "strip-src-prefix",
    enforce: "post",
    generateBundle(_options, bundle) {
      for (const key of Object.keys(bundle)) {
        if (bundle[key].fileName.startsWith("src/")) {
          const entry = bundle[key];
          entry.fileName = entry.fileName.slice(4);
          delete bundle[key];
          bundle[entry.fileName] = entry;
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [stripSrcPrefix()],
  build: {
    rollupOptions: {
      input: getVisualizationInputs(),
    },
  },
});
