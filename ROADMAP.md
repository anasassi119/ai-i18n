# Roadmap — AI translation for i18next

**Product:** `ai-i18n` is a **CLI** (and optional **`ai-i18n/i18next`** helper) for scanning source, translator **hints**, and **AI-filled** locale JSON consumed by **i18next**. Runtime behavior (plurals, nesting, namespaces, loading) is **i18next’s**.

**Baseline (today):** flat `Record<string, string>` per locale file; `init` / `generate` / `diff`; OpenAI + Anthropic; `catalogsToI18nextResources()` for a single default namespace; scanner for literal `t('key')` + literal `hint`.

## Release status (roadmap acceptance)

| Phase | What “done” means | Status |
|-------|-------------------|--------|
| **1** | [`docs/resource-contract.md`](./docs/resource-contract.md), cross-links, explicit plural / `hint` stance; no claim that `generate` emits i18next plural trees | **Met** |
| **2** | `resourceFormat`, namespace-aware writes, tests per format, `diff` semantics for new layouts ([criteria below](#phase-2--cli-alignment-with-i18next-layouts)) | **Not started** (next milestone) |
| **3** | [`docs/workflows.md`](./docs/workflows.md) with CI + `missingKey` recipes; framework-agnostic | **Met** (optional hint sidecar + `generate --check` still [backlog](#phase-3--ergonomics--editor-workflow)) |

---

## Phase 1 — Resource contract & documentation

**Goal:** Any team can answer “where do files live, what shape are they, how do hints work?” without reading source.

| Deliverable | Description |
|---------------|-------------|
| **On-disk contract** | Document **one recommended layout** (current default: `catalogDir/{locale}.json`, flat keys) and **alternatives** (per-namespace files, nested JSON) as *compatibility targets* for later phases—not promises until Phase 2. |
| **Plural / ICU stance** | Explicit doc: today we generate **flat strings**; i18next plural forms (`key_zero`, nested objects, ICU plugins) are **user/i18next concerns** until Phase 2 adds formats. Link to i18next pluralization docs. |
| **`hint` contract** | Single doc section: **CLI-only** metadata for translators; **must not** appear in runtime `t()` options in production; optional pattern (strip in build, or never pass `hint` to `react-i18next`). |
| **Cross-links** | [`docs/i18next.md`](./docs/i18next.md) ↔ [`docs/configuration.md`](./docs/configuration.md) ↔ README “Limitations” stay in sync when Phase 1 lands. |

**Acceptance criteria**

- [x] New or expanded doc under `docs/` (e.g. `docs/resource-contract.md`) linked from README and `docs/i18next.md`.
- [x] No ambiguous claim that `generate` today emits full i18next plural structures.

**Dependencies:** None (docs-only).

---

## Phase 2 — CLI alignment with i18next layouts

**Goal:** `generate` output can match how real apps structure **i18next** resources, without breaking existing flat projects.

| Deliverable | Description |
|---------------|-------------|
| **`resourceFormat` (or equivalent)** | Config flag, e.g. `flat` (default) \| `i18next-namespace` \| future: `nested-keys`. Parsing + merge logic per format. |
| **Namespace-aware writes** | Option to emit `locales/{lng}/{ns}.json` or single bundle with multiple namespaces—pick **one** additional mode first, document migration from flat. |
| **Tests** | Fixture(s) with **i18next** `createInstance().init({ resources })` + `t()` for each supported `resourceFormat`. |
| **`catalogsToI18nextResources` evolution** | Extend or add sibling helper(s) so the `ai-i18n/i18next` entry stays aligned with new on-disk shapes. |

**Acceptance criteria**

- [ ] Default behavior unchanged for existing `ai-i18n.config.json` without new fields.
- [ ] At least one non-default format covered by tests and documented.
- [ ] `diff` semantics defined for new layout (same mental model: default catalog drives key set).

**Dependencies:** Phase 1 contract doc (done — see [docs/resource-contract.md](./docs/resource-contract.md)).

---

## Phase 3 — Ergonomics & editor workflow

**Goal:** Faster iteration when keys are missing at runtime or in CI.

| Deliverable | Description |
|---------------|-------------|
| **`missingKey` / `saveMissing` recipes** | Docs (and optional tiny code snippet) for queuing keys → running `generate`, or batching new keys from a dev-only handler. |
| **CI recipe** | Documented pattern: `ai-i18n diff` fails build on drift; optional `generate --check`-style mode if needed later. |
| **Hint sidecar (optional)** | Explore `_hints.json` or comments policy so default locale JSON stays clean for production bundles. |

**Acceptance criteria**

- [x] `docs/` includes a “Workflows” or “Recipes” page with copy-paste i18next + CLI snippets.
- [x] No requirement to use a specific framework beyond i18next + optional React doc.

**Dependencies:** Phase 1 (docs structure); Phase 2 optional but recipes should mention flat + any shipped `resourceFormat`.

---

## Stretch (backlog, unprioritized)

- Watch mode / IDE extension (separate repo possible).
- **OpenAI Responses / newer APIs** behind `model` or provider version flag.
- Official **Next.js App Router** + RSC note (loading JSON, no `hint` on server components unless stripped).

---

## Non-goals

- A second React i18n runtime (`AitProvider`-style) or a **stub** translator.
- Replacing **i18next** features (ICU, `Trans`, language detector plugins) inside this package.

---

## How we use this file

1. **Phase 1** is complete (resource contract + cross-links + plural stance documented).
2. **Phase 2** is a breaking or additive semver decision per format—bump minor vs major when introducing `resourceFormat` defaults that change paths.
3. **Phase 3** docs shipped (`docs/workflows.md`); optional code (hint sidecar, `generate --check`) remains backlog.
4. Close roadmap implementation via PRs referencing this document.
