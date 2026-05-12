/**
 * Prebuild script: bundle jessie's data into web/data/ snapshots.
 *
 * Two snapshots are produced because Vercel serverless functions cannot
 * reliably resolve paths outside the bundled web/ directory:
 *   1. contradictions-snapshot.json — top 20 sanitized contradictions
 *   2. cognitive-model-snapshot.json — verbatim copy of cognitive_model_v2.json
 *
 * Run: node scripts/build-contradictions-snapshot.mjs
 */

import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SUBJECT_DIR = join(__dirname, "..", "..", "data", "subjects", "jessie");
const HISTORY_PATH = join(SUBJECT_DIR, "signals_history.json");
const MODEL_PATH = join(SUBJECT_DIR, "cognitive_model_v2.json");
const CONTRADICTIONS_OUT = join(__dirname, "..", "data", "contradictions-snapshot.json");
const MODEL_OUT = join(__dirname, "..", "data", "cognitive-model-snapshot.json");

async function main() {
  // ─── 1. Cognitive model snapshot ──────────────────────────────
  // Verbatim copy. The model is in git so this should always succeed locally
  // and on Vercel. If absent (unexpected), keep the committed snapshot.
  try {
    const modelRaw = await readFile(MODEL_PATH, "utf-8");
    await writeFile(MODEL_OUT, modelRaw, "utf-8");
    console.log(`[snapshot] Copied cognitive model to ${MODEL_OUT}`);
  } catch (err) {
    console.warn(`[snapshot] Model source not found: ${MODEL_PATH}`);
    console.warn(`[snapshot] Skipping model copy; preserving committed snapshot at ${MODEL_OUT}`);
  }

  // ─── 2. Contradictions snapshot ───────────────────────────────
  let raw;
  try {
    raw = await readFile(HISTORY_PATH, "utf-8");
  } catch (err) {
    // Source file is in .gitignore — absent on Vercel and any non-local build.
    // Skip regeneration and keep the snapshot that was committed to the repo.
    console.warn(`[snapshot] History source not found: ${HISTORY_PATH}`);
    console.warn(`[snapshot] Skipping contradictions regeneration; preserving committed snapshot at ${CONTRADICTIONS_OUT}`);
    return;
  }

  const history = JSON.parse(raw);
  const all = [];

  for (const entry of history) {
    const conflicts = entry.stated_vs_behavioral_conflicts || [];
    const ts = typeof entry.timestamp === "string" ? entry.timestamp.slice(0, 7) : "";

    for (const c of conflicts) {
      all.push({
        stated_claim: c.stated_claim,
        actual_behavior: c.actual_behavior,
        blind_spot_evidence: c.blind_spot_evidence,
        confidence: c.confidence,
        period: ts, // YYYY-MM only, no exact timestamp
      });
    }
  }

  // Sort by confidence descending, take top 20
  all.sort((a, b) => b.confidence - a.confidence);
  const top = all.slice(0, 20);

  const snapshot = { total: all.length, contradictions: top };
  await writeFile(CONTRADICTIONS_OUT, JSON.stringify(snapshot, null, 2), "utf-8");

  console.log(
    `[snapshot] Wrote ${top.length}/${all.length} contradictions to ${CONTRADICTIONS_OUT}`
  );
}

main().catch((err) => {
  console.error("[snapshot] Fatal:", err);
  process.exit(1);
});
