"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
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
  const [underlying, setUnderlying] = useState("");
  const [type, setType] = useState<"CALL" | "PUT">("CALL");
  const [strike, setStrike] = useState("");
  const [expiration, setExpiration] = useState("");
  const [contracts, setContracts] = useState("");
  const [avgPremium, setAvgPremium] = useState("");
  const [nowPremium, setNowPremium] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setName(option.name);
      setUnderlying(option.underlyingSymbol);
      setType(option.type);
      setStrike(String(option.strikePrice));
      setExpiration(option.expirationDate);
      setContracts(String(option.contracts));
      setAvgPremium(String(option.averagePremium));
      setNowPremium(String(option.nowPremium));
    }
  }, [open, option]);

  useEffect(() => {
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, []);

  const flush = useCallback(() => {
    const c = parseInt(contracts, 10);
    const a = parseFloat(avgPremium);
    const n = parseFloat(nowPremium);
    const s = parseFloat(strike);
    if (!c || c <= 0 || !a || a <= 0 || !s || s <= 0) return;
    updateOptionHolding(option.id, {
      name,
      underlyingSymbol: underlying.toUpperCase(),
      type,
      strikePrice: s,
      expirationDate: expiration,
      contracts: c,
      averagePremium: a,
      nowPremium: isNaN(n) || n <= 0 ? option.nowPremium : n,
    });
  }, [name, underlying, type, strike, expiration, contracts, avgPremium, nowPremium, option, updateOptionHolding]);

  const scheduleAutoSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, 400);
  }, [flush]);

  const update = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value);
    scheduleAutoSave();
  };

  const handleTypeChange = (t: "CALL" | "PUT") => {
    setType(t);
    scheduleAutoSave();
  };

  const handleClose = () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    flush();
    onClose();
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={handleClose}>
      <div
        className="w-full max-w-lg rounded-lg border border-[var(--tv-border)] bg-[var(--tv-bg)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold">编辑期权持仓</h2>
          <button onClick={handleClose} className="text-xl leading-none text-[var(--tv-text-secondary)] hover:text-[var(--tv-text)]">&times;</button>
        </div>

        <p className="mb-4 text-xs text-[var(--tv-text-secondary)]">修改内容将自动保存，无需点击确认</p>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">名称</label>
              <input value={name} onChange={update(setName)} className="w-full rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">OCC 代码</label>
              <input value={option.id} disabled className="w-full rounded px-3 py-2 text-sm uppercase opacity-50" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">正股代码</label>
              <input value={underlying} onChange={update(setUnderlying)} className="w-full rounded px-3 py-2 text-sm uppercase" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">类型</label>
              <div className="flex gap-2 h-[38px]">
                <button
                  onClick={() => handleTypeChange("CALL")}
                  className={`flex-1 rounded text-sm font-medium ${
                    type === "CALL" ? "bg-[var(--tv-green)] text-white" : "border border-[var(--tv-border)] text-[var(--tv-text-secondary)]"
                  }`}
                >
                  看涨 CALL
                </button>
                <button
                  onClick={() => handleTypeChange("PUT")}
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
              <input value={strike} onChange={update(setStrike)} type="number" step="0.01" className="w-full rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">到期日</label>
              <input value={expiration} onChange={update(setExpiration)} type="date" className="w-full rounded px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">持仓张数</label>
              <input value={contracts} onChange={update(setContracts)} type="number" className="w-full rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">平均权利金</label>
              <input value={avgPremium} onChange={update(setAvgPremium)} type="number" step="0.01" className="w-full rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--tv-accent)] font-medium">最新权利金（可修改）</label>
              <input
                value={nowPremium}
                onChange={update(setNowPremium)}
                type="number"
                step="0.01"
                className="w-full rounded border border-[var(--tv-accent)]/30 px-3 py-2 text-sm font-medium"
              />
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
