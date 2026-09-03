"use client";

interface BuildingViewProps {
  isRefineMode: boolean;
  focusDims: string[];
  messageCount: number;
}

// ── Render: Building state ───────────────────────────────────
export default function BuildingView({ isRefineMode, focusDims, messageCount }: BuildingViewProps) {
  return (
    <div className="flex flex-col items-center justify-center" style={{ minHeight: "60vh" }}>
      <div className="text-center">
        <div style={{ width: 32, height: 32, margin: "0 auto 20px", border: "1.5px solid var(--accent)", borderTopColor: "transparent", borderRadius: 9999 }} className="animate-spin" />
        <p style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 400, fontStyle: "italic", margin: "0 0 4px" }}>
          {isRefineMode ? "正在修正认知模型" : "正在构建认知模型"}
        </p>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-soft)", letterSpacing: "0.02em", margin: 0 }}>
          {messageCount} 条对话
          {isRefineMode && focusDims.length > 0
            ? ` · ${focusDims.length} 个维度`
            : " · 9 维度"}
        </p>
      </div>
    </div>
  );
}
