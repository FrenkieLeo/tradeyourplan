import type { IntelligenceEventType } from "@/types/workstation";

export const INTELLIGENCE_CHECK_INTERVAL_HOURS = 12;

export const ALLOWED_SOURCE_TYPES = ["IR", "NEWSROOM", "SEC", "FUND_ISSUER"] as const;

export const EVENT_TRANSLATION_POLICY: Record<IntelligenceEventType, string> = {
  EARNINGS: "保留原文链接，中文只呈现结构化核心指标、指引和差异，不全文翻译。",
  REGULATORY: "翻译标题、关键事实、时间线和潜在投资影响。",
  MANAGEMENT: "翻译标题、人员与职责变化、生效时间和潜在影响。",
  CYBERSECURITY: "翻译已确认事实、影响范围、处置进展和不确定性。",
  LITIGATION: "翻译争议事项、程序阶段、潜在金额和风险边界。",
  M_AND_A: "翻译交易结构、价格、审批条件和潜在影响。",
  FINANCING: "翻译融资规模、工具、稀释或偿债影响。",
  GUIDANCE: "翻译指引变化、管理层理由和市场预期差异。",
  PRODUCT_RECALL: "翻译涉及产品、范围、监管行动和财务风险。",
  OTHER: "仅翻译与投资判断相关的关键事实，并清楚标注不确定性。",
};

export function shouldCreateImmediateAlert(severity: string) {
  return severity === "HIGH" || severity === "CRITICAL";
}
