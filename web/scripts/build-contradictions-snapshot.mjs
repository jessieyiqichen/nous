/**
 * Prebuild script: extract and sanitize contradictions from signals_history.json
 * Outputs web/data/contradictions-snapshot.json for deployment.
 *
 * Run: node scripts/build-contradictions-snapshot.mjs
 */

import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HISTORY_PATH = join(__dirname, "..", "..", "data", "signals_history.json");
const OUTPUT_PATH = join(__dirname, "..", "data", "contradictions-snapshot.json");

async function main() {
  let raw;
  try {
    raw = await readFile(HISTORY_PATH, "utf-8");
  } catch (err) {
    console.error(`[snapshot] Cannot read ${HISTORY_PATH}: ${err.message}`);
    console.error("[snapshot] Writing empty snapshot.");
    await writeFile(
      OUTPUT_PATH,
      JSON.stringify({ total: 0, contradictions: [] }, null, 2),
      "utf-8"
    );
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
  await writeFile(OUTPUT_PATH, JSON.stringify(snapshot, null, 2), "utf-8");

  console.log(
    `[snapshot] Wrote ${top.length}/${all.length} contradictions to ${OUTPUT_PATH}`
  );
}

main().catch((err) => {
  console.error("[snapshot] Fatal:", err);
  process.exit(1);
});
