import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/cli/index.ts" },
  format: ["esm"],
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: false,
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
});
