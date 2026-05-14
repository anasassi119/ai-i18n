import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ensureTranslatorNotesFile,
  loadTranslatorNotes,
  translatorNotesPath,
} from "./translatorNotes.js";

describe("translatorNotes", () => {
  it("translatorNotesPath resolves under catalogDir", () => {
    const p = translatorNotesPath("/app", "locales");
    expect(p.endsWith(path.join("locales", "translator-notes.json"))).toBe(true);
  });

  it("ensureTranslatorNotesFile creates empty object file", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-tn-"));
    try {
      await ensureTranslatorNotesFile(dir, "locales");
      const raw = await readFile(path.join(dir, "locales", "translator-notes.json"), "utf8");
      expect(JSON.parse(raw)).toEqual({});
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("ensureTranslatorNotesFile is a no-op when file exists", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-tn2-"));
    try {
      await ensureTranslatorNotesFile(dir, "locales");
      await writeFile(
        path.join(dir, "locales", "translator-notes.json"),
        JSON.stringify({ a: "note" }, null, 2) + "\n",
        "utf8",
      );
      await ensureTranslatorNotesFile(dir, "locales");
      const raw = await readFile(path.join(dir, "locales", "translator-notes.json"), "utf8");
      expect(JSON.parse(raw)).toEqual({ a: "note" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("loadTranslatorNotes returns empty when file missing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-tn3-"));
    try {
      await mkdir(path.join(dir, "locales"), { recursive: true });
      const n = await loadTranslatorNotes(dir, "locales");
      expect(n).toEqual({});
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("loadTranslatorNotes throws on invalid JSON", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-tn5-"));
    try {
      await mkdir(path.join(dir, "locales"), { recursive: true });
      await writeFile(path.join(dir, "locales", "translator-notes.json"), "{", "utf8");
      await expect(loadTranslatorNotes(dir, "locales")).rejects.toThrow(/invalid JSON/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
