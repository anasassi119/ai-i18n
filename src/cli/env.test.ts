import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadEnvFromProject } from "./env.js";

describe("loadEnvFromProject", () => {
  const prevOpenAi = process.env.OPENAI_API_KEY;

  afterEach(() => {
    if (prevOpenAi === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevOpenAi;
  });

  it("loads OPENAI_API_KEY from .env when not set in the environment", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-env-"));
    try {
      delete process.env.OPENAI_API_KEY;
      await writeFile(path.join(dir, ".env"), "OPENAI_API_KEY=from-dotenv\n", "utf8");
      loadEnvFromProject(dir);
      expect(process.env.OPENAI_API_KEY).toBe("from-dotenv");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not override OPENAI_API_KEY already set in the environment", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-env-"));
    try {
      process.env.OPENAI_API_KEY = "from-shell";
      await writeFile(path.join(dir, ".env"), "OPENAI_API_KEY=from-dotenv\n", "utf8");
      loadEnvFromProject(dir);
      expect(process.env.OPENAI_API_KEY).toBe("from-shell");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("ignores a missing .env file", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-env-"));
    try {
      delete process.env.OPENAI_API_KEY;
      loadEnvFromProject(dir);
      expect(process.env.OPENAI_API_KEY).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
