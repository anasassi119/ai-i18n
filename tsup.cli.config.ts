import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { cli: "src/cli/index.ts" },
    format: ["esm"],
    dts: false,
    splitting: false,
    sourcemap: true,
    clean: true,
    outDir: "dist",
    platform: "node",
    target: "node18",
    banner: {
      js: "#!/usr/bin/env node",
    },
    external: [
      "openai",
      "@anthropic-ai/sdk",
      "fast-glob",
      "@babel/parser",
      "@babel/traverse",
      "@babel/types",
    ],
  },
  {
    entry: { i18next: "src/i18next.ts" },
    format: ["esm"],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: false,
    outDir: "dist",
    platform: "neutral",
    target: "es2022",
    external: ["i18next"],
  },
]);
