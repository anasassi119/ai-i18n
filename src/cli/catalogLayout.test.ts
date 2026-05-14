import { describe, expect, it } from "vitest";
import { localeCatalogPathFromParts } from "./catalogLayout.js";

describe("localeCatalogPathFromParts", () => {
  const cwd = "/tmp/proj";

  it("uses flat layout by default", () => {
    expect(localeCatalogPathFromParts(cwd, "locales", "en", undefined, undefined)).toMatch(/locales[/\\]en\.json$/);
  });

  it("uses flat layout when resourceFormat is flat", () => {
    expect(localeCatalogPathFromParts(cwd, "locales", "en", "flat", undefined)).toMatch(/locales[/\\]en\.json$/);
  });

  it("uses i18next-namespace layout with default namespace", () => {
    expect(localeCatalogPathFromParts(cwd, "locales", "en", "i18next-namespace", undefined)).toMatch(
      /locales[/\\]en[/\\]translation\.json$/,
    );
  });

  it("uses i18next-namespace layout with custom namespace", () => {
    expect(localeCatalogPathFromParts(cwd, "locales", "fr", "i18next-namespace", "common")).toMatch(
      /locales[/\\]fr[/\\]common\.json$/,
    );
  });
});
