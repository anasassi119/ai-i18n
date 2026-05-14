import { config } from "dotenv";
import path from "node:path";

/**
 * Loads `.env` from the project root (`cwd`). Variables already set in
 * `process.env` (e.g. exported in the shell) are not overwritten.
 */
export function loadEnvFromProject(cwd: string): void {
  config({ path: path.resolve(cwd, ".env") });
}
