import { NextRequest } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";

const HISTORY_PATH = join(process.cwd(), "..", "data", "subjects", "jessie", "signals_history.json");

interface Conflict {
  stated_claim: string;
  actual_behavior: string;
  blind_spot_evidence: string;
  confidence: number;
  stated_signal_index?: number;
  behavioral_signal_index?: number;
}

interface HistoryEntry {
  timestamp: string;
  source: string;
  signals_count: number;
  conflicts_count: number;
  stated_vs_behavioral_conflicts: Conflict[];
  conversation_summary?: string;
  reviewed?: boolean;
  conflict_reviews?: Record<number, "valid" | "invalid" | "uncertain">;
}

async function loadHistory(): Promise<HistoryEntry[]> {
  try {
    const text = await readFile(HISTORY_PATH, "utf-8");
    return JSON.parse(text) as HistoryEntry[];
  } catch {
    return [];
  }
}

async function saveHistory(history: HistoryEntry[]): Promise<void> {
  await writeFile(HISTORY_PATH, JSON.stringify(history, null, 2), "utf-8");
}

// GET — return unreviewed conflicts from passive extractions
export async function GET() {
  try {
    const history = await loadHistory();
    const conflicts: Array<{
      entryIndex: number;
      conflictIndex: number;
      source: string;
      timestamp: string;
      conflict: Conflict;
      review?: "valid" | "invalid" | "uncertain";
    }> = [];

    for (let ei = 0; ei < history.length; ei++) {
      const entry = history[ei];
      if (!entry.source?.startsWith("passive:")) continue;
      const cs = entry.stated_vs_behavioral_conflicts || [];
      const reviews = entry.conflict_reviews || {};
      for (let ci = 0; ci < cs.length; ci++) {
        conflicts.push({
          entryIndex: ei,
          conflictIndex: ci,
          source: entry.source,
          timestamp: entry.timestamp,
          conflict: cs[ci],
          review: reviews[ci],
        });
      }
    }

    const unreviewed = conflicts.filter((c) => !c.review);
    const reviewed = conflicts.filter((c) => c.review);

    return Response.json({
      total: conflicts.length,
      unreviewed: unreviewed.length,
      reviewed: reviewed.length,
      conflicts: unreviewed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// POST — submit reviews for conflicts
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { reviews } = body as {
      reviews: Array<{
        entryIndex: number;
        conflictIndex: number;
        verdict: "valid" | "invalid" | "uncertain";
      }>;
    };

    if (!reviews || !Array.isArray(reviews)) {
      return Response.json({ error: "缺少 reviews 数据" }, { status: 400 });
    }

    const history = await loadHistory();
    let updated = 0;

    for (const r of reviews) {
      const entry = history[r.entryIndex];
      if (!entry) continue;
      if (!entry.conflict_reviews) entry.conflict_reviews = {};
      entry.conflict_reviews[r.conflictIndex] = r.verdict;
      updated++;
    }

    // Mark entry as fully reviewed if all conflicts have reviews
    for (const entry of history) {
      if (!entry.source?.startsWith("passive:")) continue;
      const cs = entry.stated_vs_behavioral_conflicts || [];
      const reviews = entry.conflict_reviews || {};
      if (cs.length > 0 && cs.every((_, i) => reviews[i])) {
        entry.reviewed = true;
      }
    }

    await saveHistory(history);

    return Response.json({ updated, message: `已更新 ${updated} 条矛盾的 review` });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
