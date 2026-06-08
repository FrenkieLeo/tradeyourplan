"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/lib/store";
import type { FundamentalEntry } from "@/types";

interface FundamentalModalProps {
  open: boolean;
  onClose: () => void;
  entry: FundamentalEntry | null;
}

export default function FundamentalModal({ open, onClose, entry }: FundamentalModalProps) {
  const { updateFundamentalEntry, removeFundamentalEntry } = useStore();
  const [draft, setDraft] = useState<FundamentalEntry | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const displayEntry = draft ?? entry;

  const persistDraft = useCallback(
    (id: string, updates: Partial<FundamentalEntry>) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        updateFundamentalEntry(id, updates);
      }, 400);
    },
    [updateFundamentalEntry]
  );

  useEffect(() => {
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, []);

  useEffect(() => {
    if (open && entry) {
      setDraft({ ...entry });
      setShowDeleteConfirm(false);
    }
    if (!open) {
      setDraft(null);
      setShowDeleteConfirm(false);
    }
  }, [open, entry]);

  if (!open || !displayEntry) return null;

  const handleChange = (key: keyof FundamentalEntry, raw: string) => {
    const id = displayEntry.id;
    const numericKeys: (keyof FundamentalEntry)[] = ["fiscalYearEndMonth", "peLow", "peHigh", "peMedian", "currentFYEps", "nextFYEps"];
    let value: string | number = raw;
    if (numericKeys.includes(key)) {
      const n = parseFloat(raw);
      value = isNaN(n) ? 0 : n;
    }
    if (key === "stockCode") value = raw.toUpperCase();
    const next = { ...displayEntry, [key]: value } as FundamentalEntry;
    setDraft(next);
    persistDraft(id, { [key]: value });
  };

  const handleClose = () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (draft && entry) {
      updateFundamentalEntry(entry.id, draft);
    }
    onClose();
  };

  const handleDelete = () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    removeFundamentalEntry(displayEntry.id);
    onClose();
  };

  const now = new Date();
  const currentYear = now.getFullYear();
  const fm = displayEntry.fiscalYearEndMonth || 12;
  const month = now.getMonth() + 1;
  const fyLabel = month >= fm ? `FY${currentYear + 1}` : `FY${currentYear}`;
  const nfyLabel = month >= fm ? `FY${currentYear + 2}` : `FY${currentYear + 1}`;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={handleClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-[var(--tv-border)] bg-[var(--tv-bg)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-base font-semibold text-[var(--tv-text)]">编辑基本面数据</h3>
          <button onClick={handleClose} className="text-xl leading-none text-[var(--tv-text-secondary)] hover:text-[var(--tv-text)]">
            &times;
          </button>
        </div>

        <p className="mb-4 text-xs text-[var(--tv-text-secondary)]">修改内容将自动保存，无需点击确认</p>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">股票代码</label>
              <input
                value={displayEntry.stockCode}
                onChange={(e) => handleChange("stockCode", e.target.value)}
                className="w-full rounded px-3 py-2 text-sm uppercase"
                placeholder="如 NVDA"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">财年截止月</label>
              <select
                value={displayEntry.fiscalYearEndMonth}
                onChange={(e) => handleChange("fiscalYearEndMonth", e.target.value)}
                className="w-full rounded px-3 py-2 text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>{m} 月</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">PE 下限</label>
              <input value={displayEntry.peLow || ""} onChange={(e) => handleChange("peLow", e.target.value)} type="number" step="0.1" className="w-full rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">PE 上限</label>
              <input value={displayEntry.peHigh || ""} onChange={(e) => handleChange("peHigh", e.target.value)} type="number" step="0.1" className="w-full rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">PE 中位数</label>
              <input value={displayEntry.peMedian || ""} onChange={(e) => handleChange("peMedian", e.target.value)} type="number" step="0.1" className="w-full rounded px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">当前财年 EPS ({fyLabel})</label>
              <input value={displayEntry.currentFYEps || ""} onChange={(e) => handleChange("currentFYEps", e.target.value)} type="number" step="0.01" className="w-full rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">下一财年 EPS ({nfyLabel})</label>
              <input value={displayEntry.nextFYEps || ""} onChange={(e) => handleChange("nextFYEps", e.target.value)} type="number" step="0.01" className="w-full rounded px-3 py-2 text-sm" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">最近筹码强支撑</label>
            <input value={displayEntry.supportRange} onChange={(e) => handleChange("supportRange", e.target.value)} className="w-full rounded px-3 py-2 text-sm" placeholder="如 257-270 (中)" />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          {showDeleteConfirm ? (
            <div className="flex gap-2">
              <button onClick={handleDelete} className="rounded px-3 py-1.5 text-sm text-[var(--tv-red)] hover:underline">确认删除</button>
              <button onClick={() => setShowDeleteConfirm(false)} className="rounded px-3 py-1.5 text-sm text-[var(--tv-text-secondary)] hover:underline">取消</button>
            </div>
          ) : (
            <button onClick={() => setShowDeleteConfirm(true)} className="text-sm text-[var(--tv-text-secondary)] hover:text-[var(--tv-red)]">删除此行</button>
          )}
          <div />
        </div>
      </div>
    </div>,
    document.body
  );
}
