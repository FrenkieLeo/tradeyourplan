"use client";

import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import type { OptionHolding } from "@/types";

interface OptionEditModalProps {
  option: OptionHolding;
  open: boolean;
  onClose: () => void;
}

export default function OptionEditModal({ option, open, onClose }: OptionEditModalProps) {
  const { updateOptionHolding } = useStore();

  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [underlying, setUnderlying] = useState("");
  const [type, setType] = useState<"CALL" | "PUT">("CALL");
  const [strike, setStrike] = useState("");
  const [expiration, setExpiration] = useState("");
  const [contracts, setContracts] = useState("");
  const [avgPremium, setAvgPremium] = useState("");
  const [nowPremium, setNowPremium] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(option.name);
      setId(option.id);
      setUnderlying(option.underlyingSymbol);
      setType(option.type);
      setStrike(String(option.strikePrice));
      setExpiration(option.expirationDate);
      setContracts(String(option.contracts));
      setAvgPremium(String(option.averagePremium));
      setNowPremium(String(option.nowPremium));
      setError(null);
    }
  }, [open, option]);

  const handleSave = () => {
    const c = parseInt(contracts, 10);
    const a = parseFloat(avgPremium);
    const n = parseFloat(nowPremium);
    const s = parseFloat(strike);
    if (!c || c <= 0) { setError("张数无效"); return; }
    if (!a || a <= 0) { setError("平均权利金无效"); return; }
    if (!n || n <= 0) { setError("最新权利金无效"); return; }
    if (!s || s <= 0) { setError("行权价无效"); return; }

    updateOptionHolding(option.id, {
      name,
      underlyingSymbol: underlying.toUpperCase(),
      type,
      strikePrice: s,
      expirationDate: expiration,
      contracts: c,
      averagePremium: a,
      nowPremium: n,
    });
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-lg border border-[var(--tv-border)] bg-[var(--tv-bg)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold">编辑期权持仓</h2>
          <button onClick={onClose} className="text-xl leading-none text-[var(--tv-text-secondary)] hover:text-[var(--tv-text)]">&times;</button>
        </div>

        {error && (
          <div className="mb-3 rounded border border-[var(--tv-red)]/30 bg-[var(--tv-red)]/10 px-3 py-2 text-sm text-[var(--tv-red)]">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">名称</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">OCC 代码</label>
              <input value={id} onChange={(e) => setId(e.target.value)} className="w-full rounded px-3 py-2 text-sm uppercase" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">正股代码</label>
              <input value={underlying} onChange={(e) => setUnderlying(e.target.value)} className="w-full rounded px-3 py-2 text-sm uppercase" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">类型</label>
              <div className="flex gap-2 h-[38px]">
                <button
                  onClick={() => setType("CALL")}
                  className={`flex-1 rounded text-sm font-medium ${
                    type === "CALL" ? "bg-[var(--tv-green)] text-white" : "border border-[var(--tv-border)] text-[var(--tv-text-secondary)]"
                  }`}
                >
                  看涨 CALL
                </button>
                <button
                  onClick={() => setType("PUT")}
                  className={`flex-1 rounded text-sm font-medium ${
                    type === "PUT" ? "bg-[var(--tv-red)] text-white" : "border border-[var(--tv-border)] text-[var(--tv-text-secondary)]"
                  }`}
                >
                  看跌 PUT
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">行权价</label>
              <input value={strike} onChange={(e) => setStrike(e.target.value)} type="number" step="0.01" className="w-full rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">到期日</label>
              <input value={expiration} onChange={(e) => setExpiration(e.target.value)} type="date" className="w-full rounded px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">持仓张数</label>
              <input value={contracts} onChange={(e) => setContracts(e.target.value)} type="number" className="w-full rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">平均权利金</label>
              <input value={avgPremium} onChange={(e) => setAvgPremium(e.target.value)} type="number" step="0.01" className="w-full rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--tv-accent)] font-medium">最新权利金（可修改）</label>
              <input
                value={nowPremium}
                onChange={(e) => setNowPremium(e.target.value)}
                type="number"
                step="0.01"
                className="w-full rounded border border-[var(--tv-accent)]/30 px-3 py-2 text-sm font-medium"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded border border-[var(--tv-border)] px-4 py-2 text-sm text-[var(--tv-text-secondary)] hover:text-[var(--tv-text)]">
            取消
          </button>
          <button onClick={handleSave} className="rounded bg-[var(--tv-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-80">
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
