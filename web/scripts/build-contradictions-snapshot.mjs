/**
 * Prebuild: 把「被试目录」里的认知模型 / 风格卡 / 矛盾 打包成 web/data/ 下的三个 snapshot。
 * Vercel serverless 读不到 web/ 之外的路径，所以构建期复制进来。
 *
 * 被试目录：环境变量 NOUS_SUBJECT_DIR（绝对路径或相对仓库根），默认 data/samples/（虚构示例人物）。
 * 目录内可有：
 *   cognitive_model.json | cognitive_model_v2.json   → cognitive-model-snapshot.json
 *   style-card.json                                   → style-card.json
 *   signals_history.json（派生 top20）| contradictions.json（直接取） → contradictions-snapshot.json
 * 缺哪个就跳过哪个，保留已提交的 snapshot。
 *
 * Run: node scripts/build-contradictions-snapshot.mjs
 */

import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");
const OUT_DIR = join(__dirname, "..", "data");
const TOP_N = 20;

function resolveSubjectDir() {
  const env = process.env.NOUS_SUBJECT_DIR;
  if (!env) return join(REPO_ROOT, "data", "samples");
  return isAbsolute(env) ? env : join(REPO_ROOT, env);
}

async function readJSONIfExists(path) {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch {
    return null;
  }
}

async function firstExisting(dir, names) {
  for (const name of names) {
    const data = await readJSONIfExists(join(dir, name));
    if (data) return { name, data };
  }
  return null;
}

/** signals_history.json → 按置信度排序的脱敏矛盾列表（只留 YYYY-MM） */
function deriveFromHistory(history) {
  const all = [];
  for (const entry of history) {
    const ts = typeof entry.timestamp === "string" ? entry.timestamp.slice(0, 7) : "";
    for (const c of entry.stated_vs_behavioral_conflicts || []) {
      all.push({
        stated_claim: c.stated_claim,
        actual_behavior: c.actual_behavior,
        blind_spot_evidence: c.blind_spot_evidence,
        confidence: c.confidence,
        period: ts,
      });
    }
  }
  all.sort((a, b) => b.confidence - a.confidence);
  return { total: all.length, contradictions: all.slice(0, TOP_N) };
}

async function writeOut(name, data) {
  await writeFile(join(OUT_DIR, name), JSON.stringify(data, null, 2) + "\n", "utf-8");
  console.log(`[snapshot] wrote ${name}`);
}

async function main() {
  const dir = resolveSubjectDir();
  console.log(`[snapshot] subject dir: ${dir}`);

  const model = await firstExisting(dir, ["cognitive_model.json", "cognitive_model_v2.json"]);
  if (model) await writeOut("cognitive-model-snapshot.json", model.data);
  else console.warn("[snapshot] no cognitive model in subject dir; keeping committed snapshot");

  const style = await readJSONIfExists(join(dir, "style-card.json"));
  if (style) await writeOut("style-card.json", style);
  else console.warn("[snapshot] no style-card.json; keeping committed snapshot");

  const history = await readJSONIfExists(join(dir, "signals_history.json"));
  const direct = history ? null : await readJSONIfExists(join(dir, "contradictions.json"));
  if (history) {
    await writeOut("contradictions-snapshot.json", deriveFromHistory(history));
  } else if (direct?.contradictions) {
    const top = [...direct.contradictions].sort((a, b) => b.confidence - a.confidence).slice(0, TOP_N);
    await writeOut("contradictions-snapshot.json", { total: direct.total ?? direct.contradictions.length, contradictions: top });
  } else {
    console.warn("[snapshot] no signals_history.json / contradictions.json; keeping committed snapshot");
  }
}

main().catch((err) => {
  console.error("[snapshot] Fatal:", err);
  process.exit(1);
});
