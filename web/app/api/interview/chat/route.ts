import { NextRequest } from "next/server";
import { deepseekChatText } from "@/lib/deepseek";
import { INTERVIEWER_SYSTEM_PROMPT_ZH, INTERVIEWER_SYSTEM_PROMPT_EN, REFINE_PROMPT_ADDON_ZH } from "@/lib/interview-prompts";

export const maxDuration = 60;

interface ChatRequest {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  lang?: "zh" | "en";
  coverageHint?: string;
  refineMode?: {
    modelSummary: string;
    focusDimensions: string[];
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ChatRequest;
    const { messages, lang = "zh", coverageHint, refineMode } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return Response.json(
        { error: "No messages provided" },
        { status: 400 }
      );
    }

    let basePrompt =
      lang === "zh"
        ? INTERVIEWER_SYSTEM_PROMPT_ZH
        : INTERVIEWER_SYSTEM_PROMPT_EN;

    // Add refine mode addon if applicable
    if (refineMode) {
      const focusStr = refineMode.focusDimensions.map((d) => `- ${d}`).join("\n");
      basePrompt += REFINE_PROMPT_ADDON_ZH
        .replace("{model_summary}", refineMode.modelSummary)
        .replace("{focus_dims}", focusStr);
    }

    const systemPrompt = coverageHint
      ? basePrompt + "\n\n" + coverageHint
      : basePrompt;

    const text = await deepseekChatText({
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      maxTokens: 1024,
    });

    return Response.json({ reply: text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Interview chat API error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
