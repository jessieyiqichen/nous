/** 邀请码校验（auth 和 sync 路由共用）。PILOT_CODES 为逗号分隔列表。 */
export function isValidPilotCode(code: unknown): code is string {
  if (typeof code !== "string" || !code.trim()) return false;
  const codes = (process.env.PILOT_CODES || "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  return codes.includes(code.trim());
}

export function pilotCodesConfigured(): boolean {
  return (process.env.PILOT_CODES || "").trim().length > 0;
}
