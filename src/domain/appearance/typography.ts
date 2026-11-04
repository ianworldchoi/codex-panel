export interface PanelTypography {
  composerFontFamily: string;
  composerFontSize: number;
  userFontFamily: string;
  userFontSize: number;
  assistantFontFamily: string;
  assistantFontSize: number;
  chatLineHeight: number;
}

export const DEFAULT_PANEL_TYPOGRAPHY: PanelTypography = {
  composerFontFamily: "",
  composerFontSize: 15,
  userFontFamily: "",
  userFontSize: 15,
  assistantFontFamily: "",
  assistantFontSize: 15,
  chatLineHeight: 1.65,
};

export function normalizePanelTypography(record: Record<string, unknown>): PanelTypography {
  return {
    composerFontFamily: normalizeFontFamily(record["composerFontFamily"]),
    composerFontSize: normalizeFontSize(record["composerFontSize"]),
    userFontFamily: normalizeFontFamily(record["userFontFamily"]),
    userFontSize: normalizeFontSize(record["userFontSize"]),
    assistantFontFamily: normalizeFontFamily(record["assistantFontFamily"]),
    assistantFontSize: normalizeFontSize(record["assistantFontSize"]),
    chatLineHeight: normalizeChatLineHeight(record["chatLineHeight"]),
  };
}

export function normalizeFontFamily(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeFontSize(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(28, Math.max(11, value)) : 15;
}

export function normalizeChatLineHeight(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(2.2, Math.max(1.2, value)) : 1.65;
}
