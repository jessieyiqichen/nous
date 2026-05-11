import { readFile } from "fs/promises";
import { join } from "path";

export async function GET() {
  try {
    const modelPath = join(process.cwd(), "..", "data", "cognitive_model_v2.json");
    const raw = await readFile(modelPath, "utf-8");
    const model = JSON.parse(raw);
    return Response.json(model);
  } catch {
    return Response.json({ error: "无法加载认知模型" }, { status: 500 });
  }
}
