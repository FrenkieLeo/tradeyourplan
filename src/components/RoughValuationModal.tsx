"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/lib/store";
import type { RoughValuationEntry, FundamentalEntry } from "@/types";

interface RoughValuationModalProps {
  open: boolean;
  onClose: () => void;
  entry: RoughValuationEntry | null;
  defaultStockCode?: string;
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function emptyEntry(stockCode = ""): RoughValuationEntry {
  const now = Date.now();
  return {
    id: newId(),
    stockCode,
    marketCap: 0,
    equityInvestments: 0,
    cashAndShortTerm: 0,
    longTermDebt: 0,
    sharesOutstanding: 0,
    netIncome: 0,
    equityInvestmentIncome: 0,
    opportunityCost: 8,
    futurePE: 0,
    expectedGrowthRate: 0,
    createdAt: now,
    updatedAt: now,
  };
}

// 段永平估估拆解法（方案 B）：
// - 反推增速 g：当前市值给定时，企业 10 年后必须达到的净利润复合增速；
// - 毛估估股价：用用户主观预期增速 g' 正向算 → 折现 → 加单股净金融资产。
function computeRoughValuation(e: RoughValuationEntry) {
  const r = e.opportunityCost / 100;
  const g2 = e.expectedGrowthRate / 100;
  const H = e.marketCap - e.equityInvestments - e.cashAndShortTerm + e.longTermDebt;
  const N = e.equityInvestments + e.cashAndShortTerm - e.longTermDebt;
  const R0 = e.netIncome - e.equityInvestmentIncome;
  const S = e.sharesOutstanding;
  const PE = e.futurePE;

  const growthPow = Math.pow(1 + r, 10);
  const H10 = H * growthPow;
  const R10 = PE > 0 ? H10 / PE : 0;

  const impliedGrowth =
    R0 > 0 && R10 > 0 ? Math.pow(R10 / R0, 1 / 10) - 1 : NaN;

  let fairPrice = NaN;
  if (S > 0 && PE > 0) {
    const R_per = R0 / S;
    const N_per = N / S;
    const future_R_per = R_per * Math.pow(1 + g2, 10);
    const future_value_per = future_R_per * PE;
    const discounted = future_value_per / growthPow;
    fairPrice = discounted + N_per;
  }

  const currentPrice = S > 0 ? e.marketCap / S : NaN;

  return { impliedGrowth, fairPrice, currentPrice, H, R0, N };
}

function fmtPct(v: number) {
  if (!isFinite(v)) return "—";
  return `${(v * 100).toFixed(2)}%`;
}
function fmtNum(v: number, digits = 2) {
  if (!isFinite(v)) return "—";
  return v.toFixed(digits);
}

interface FieldRow {
  key: keyof RoughValuationEntry;
  label: string;
  placeholder?: string;
  step?: string;
  suffix?: string;
}

const FIELDS: FieldRow[] = [
  { key: "marketCap", label: "当前市值", placeholder: "如 1000", step: "any" },
  { key: "equityInvestments", label: "股权投资（非流动证券及其他）", step: "any" },
  { key: "cashAndShortTerm", label: "现金及短期投资", step: "any" },
  { key: "longTermDebt", label: "长期债务（有息负债）", step: "any" },
  { key: "sharesOutstanding", label: "流通股本", placeholder: "如 10（亿股）", step: "any" },
  { key: "netIncome", label: "净利润", step: "any" },
  { key: "equityInvestmentIncome", label: "股权投资带来的其他利润", step: "any" },
  { key: "opportunityCost", label: "机会成本", step: "0.1", suffix: "%" },
  { key: "futurePE", label: "10 年后市盈率", step: "0.1" },
  { key: "expectedGrowthRate", label: "预期增速 g'（你判断公司未来10年实际能做到的增速）", step: "0.1", suffix: "%" },
];

export default function RoughValuationModal({ open, onClose, entry, defaultStockCode }: RoughValuationModalProps) {
  const {
    fundamentalEntries,
    roughValuationEntries,
    addRoughValuationEntry,
    updateRoughValuationEntry,
    removeRoughValuationEntry,
    addFundamentalEntry,
  } = useStore();

  const [draft, setDraft] = useState<RoughValuationEntry | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [stockCodeError, setStockCodeError] = useState<string | null>(null);
  const isNew = !entry;

  useEffect(() => {
    if (open) {
      if (entry) {
        setDraft({ ...entry });
      } else {
        setDraft(emptyEntry(defaultStockCode ?? ""));
      }
      setShowDeleteConfirm(false);
      setStockCodeError(null);
    } else {
      setDraft(null);
      setShowDeleteConfirm(false);
    }
  }, [open, entry, defaultStockCode]);

  const result = useMemo(() => (draft ? computeRoughValuation(draft) : null), [draft]);

  if (!open || !draft || !result) return null;

  const handleChange = (key: keyof RoughValuationEntry, raw: string) => {
    let value: string | number = raw;
    const numericKeys = FIELDS.map((f) => f.key);
    if (numericKeys.includes(key)) {
      const n = parseFloat(raw);
      value = isNaN(n) ? 0 : n;
    }
    if (key === "stockCode") value = raw.toUpperCase();
    setDraft({ ...draft, [key]: value } as RoughValuationEntry);
  };

  const handleSave = () => {
    const code = (draft.stockCode || "").trim().toUpperCase();
    if (!code) {
      setStockCodeError("请输入股票代码");
      return;
    }
    // 同一股票只允许一条毛估估记录
    const conflict = roughValuationEntries.find((r) => r.stockCode === code && r.id !== draft.id);
    if (conflict) {
      setStockCodeError(`${code} 已存在毛估估记录，请直接编辑该行`);
      return;
    }

    const payload: RoughValuationEntry = { ...draft, stockCode: code, updatedAt: Date.now() };

    if (isNew) {
      addRoughValuationEntry(payload);
      // 若基本面清单尚无此股票，自动建一条空基本面行，方便用户后续补 PE/EPS。
      const existsInFundamental = fundamentalEntries.some((f) => f.stockCode === code);
      if (!existsInFundamental) {
        const now = Date.now();
        const fEntry: FundamentalEntry = {
          id: newId(),
          stockCode: code,
          fiscalYearEndMonth: 12,
          peLow: 0,
          peHigh: 0,
          peMedian: 0,
          currentFYEps: 0,
          nextFYEps: 0,
          supportRange: "",
          createdAt: now,
          updatedAt: now,
        };
        addFundamentalEntry(fEntry);
      }
    } else {
      updateRoughValuationEntry(draft.id, payload);
    }
    onClose();
  };

  const handleDelete = () => {
    if (entry) removeRoughValuationEntry(entry.id);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[var(--tv-border)] bg-[var(--tv-bg)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-base font-semibold text-[var(--tv-text)]">毛估估计算器（段永平估估拆解法）</h3>
          <button onClick={onClose} className="text-xl leading-none text-[var(--tv-text-secondary)] hover:text-[var(--tv-text)]">
            &times;
          </button>
        </div>

        <p className="mb-4 text-xs leading-relaxed text-[var(--tv-text-secondary)]">
          用买房子收租金的思路：房子价值 = 市值 − 股权投资 − 现金及短期投资 + 长期债务；
          租金 = 净利润 − 股权投资其他利润。反推「10 年后房子按机会成本应增值到多少 → 倒推出公司必须达到的复合增速」，
          再用你主观相信的增速 g' 正向算合理股价。
        </p>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">股票代码</label>
            <input
              value={draft.stockCode}
              onChange={(e) => {
                setStockCodeError(null);
                handleChange("stockCode", e.target.value);
              }}
              disabled={!isNew}
              className="w-full rounded border border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] px-3 py-2 text-sm uppercase disabled:opacity-60"
              placeholder="如 NVDA"
            />
            {stockCodeError && <p className="mt-1 text-xs text-[var(--tv-red)]">{stockCodeError}</p>}
          </div>

          {FIELDS.map((f) => (
            <div key={f.key} className="col-span-2 md:col-span-1">
              <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">{f.label}</label>
              <div className="relative">
                <input
                  type="number"
                  step={f.step ?? "any"}
                  value={(draft[f.key] as number) || ""}
                  onChange={(e) => handleChange(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  className="w-full rounded border border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] px-3 py-2 pr-8 text-sm"
                />
                {f.suffix && (
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--tv-text-secondary)]">
                    {f.suffix}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mb-5 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] p-4">
          <h4 className="mb-3 text-sm font-medium text-[var(--tv-text)]">计算结果</h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-[var(--tv-text-secondary)]">毛估估增速 g（反推）</div>
              <div className="mt-1 text-base font-medium text-[var(--tv-yellow)]">{fmtPct(result.impliedGrowth)}</div>
              <div className="mt-1 text-[11px] text-[var(--tv-text-secondary)]">市场要求公司未来 10 年达到此年复合增速</div>
            </div>
            <div>
              <div className="text-xs text-[var(--tv-text-secondary)]">毛估估股价（按 g' 正向算）</div>
              <div className="mt-1 text-base font-medium text-[var(--tv-yellow)]">{fmtNum(result.fairPrice)}</div>
              <div className="mt-1 text-[11px] text-[var(--tv-text-secondary)]">
                当前每股价：{fmtNum(result.currentPrice)}
                {isFinite(result.fairPrice) && isFinite(result.currentPrice) && result.currentPrice > 0 && (
                  <span className={result.fairPrice >= result.currentPrice ? "ml-2 text-[var(--tv-green)]" : "ml-2 text-[var(--tv-red)]"}>
                    {result.fairPrice >= result.currentPrice ? "低估" : "高估"}
                    {`（${(((result.fairPrice - result.currentPrice) / result.currentPrice) * 100).toFixed(1)}%）`}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="mt-3 border-t border-[var(--tv-border)] pt-3 text-[11px] text-[var(--tv-text-secondary)]">
            房子价值 H = {fmtNum(result.H)} ｜ 当前租金 R₀ = {fmtNum(result.R0)} ｜ 净金融资产 N = {fmtNum(result.N)}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            {!isNew && (
              showDeleteConfirm ? (
                <div className="flex gap-2">
                  <button onClick={handleDelete} className="rounded px-3 py-1.5 text-sm text-[var(--tv-red)] hover:underline">确认删除</button>
                  <button onClick={() => setShowDeleteConfirm(false)} className="rounded px-3 py-1.5 text-sm text-[var(--tv-text-secondary)] hover:underline">取消</button>
                </div>
              ) : (
                <button onClick={() => setShowDeleteConfirm(true)} className="text-sm text-[var(--tv-text-secondary)] hover:text-[var(--tv-red)]">删除此记录</button>
              )
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded border border-[var(--tv-border)] px-4 py-1.5 text-sm hover:bg-[var(--tv-bg-secondary)]">
              取消
            </button>
            <button onClick={handleSave} className="rounded bg-[var(--tv-accent)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-80">
              保存
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// 给 FundamentalList 直接拿来算 helper（避免循环）。
export { computeRoughValuation };
