"use client";

import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";

interface CashModalProps {
  open: boolean;
  onClose: () => void;
}

export default function CashModal({ open, onClose }: CashModalProps) {
  const { cash, updateCash } = useStore();
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (open) {
      setAmount(String(cash.total));
    }
  }, [open, cash.total]);

  if (!open) return null;

  const handleSave = () => {
    const num = parseFloat(amount);
    if (isNaN(num) || num < 0) return;
    updateCash(num);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-lg border border-[var(--tv-border)] bg-[var(--tv-bg)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">修改现金储备</h2>
          <button onClick={onClose} className="text-[var(--tv-text-secondary)] hover:text-[var(--tv-text)] text-xl leading-none">&times;</button>
        </div>

        <div className="mb-1 text-xs text-[var(--tv-text-secondary)]">当前现金: ${cash.total.toLocaleString()}</div>

        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          type="number"
          step="0.01"
          className="w-full rounded border border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] px-3 py-2 text-lg font-semibold outline-none focus:border-[var(--tv-accent)]"
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") { handleSave(); } }}
        />

        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded border border-[var(--tv-border)] px-4 py-2 text-sm text-[var(--tv-text-secondary)] hover:text-[var(--tv-text)]"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="rounded bg-[var(--tv-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-80"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
