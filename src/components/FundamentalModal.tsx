"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/lib/store";
import type { FundamentalEntry } from "@/types";

interface FundamentalModalProps {
  open: boolean;
  onClose: () => void;
  stockCode: string | null;
  editingEntry: FundamentalEntry | null;
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export default function FundamentalModal({ open, onClose, stockCode, editingEntry }: FundamentalModalProps) {
  const { addFundamentalEntry, updateFundamentalEntry, removeFundamentalEntry } = useStore();

  const [code, setCode] = useState("");
  const [fiscalMonth, setFiscalMonth] = useState("12");
  const [peLow, setPeLow] = useState("");
  const [peHigh, setPeHigh] = useState("");
  const [peMedian, setPeMedian] = useState("");
  const [currentEps, setCurrentEps] = useState("");
  const [nextEps, setNextEps] = useState("");
  const [support, setSupport] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!open) {
      setErrorMsg(null);
      setShowDeleteConfirm(false);
      return;
    }
    if (editingEntry) {
      setCode(editingEntry.stockCode);
      setFiscalMonth(String(editingEntry.fiscalYearEndMonth));
      setPeLow(String(editingEntry.peLow));
      setPeHigh(String(editingEntry.peHigh));
      setPeMedian(String(editingEntry.peMedian));
      setCurrentEps(String(editingEntry.currentFYEps));
      setNextEps(String(editingEntry.nextFYEps));
      setSupport(editingEntry.supportRange);
    } else {
      setCode(stockCode ?? "");
      setFiscalMonth("12");
      setPeLow("");
      setPeHigh("");
      setPeMedian("");
      setCurrentEps("");
      setNextEps("");
      setSupport("");
    }
  }, [open, editingEntry, stockCode]);

  if (!open) return null;

  const handleSave = () => {
    setErrorMsg(null);
    const trimCode = code.trim().toUpperCase();
    if (!trimCode) { setErrorMsg("请输入股票代码"); return; }
    const pl = parseFloat(peLow);
    const ph = parseFloat(peHigh);
    const pm = parseFloat(peMedian);
    const ce = parseFloat(currentEps);
    const ne = parseFloat(nextEps);
    const fm = parseInt(fiscalMonth, 10);
    if (!fm || fm < 1 || fm > 12) { setErrorMsg("财年截止月须为 1-12"); return; }
    if (isNaN(pl) || isNaN(ph)) { setErrorMsg("请输入有效的 PE 波动范围"); return; }
    if (isNaN(pm)) { setErrorMsg("请输入有效的 PE 中位数"); return; }

    const entry: FundamentalEntry = {
      id: editingEntry?.id ?? newId(),
      stockCode: trimCode,
      fiscalYearEndMonth: fm,
      peLow: pl,
      peHigh: ph,
      peMedian: pm,
      currentFYEps: isNaN(ce) ? 0 : ce,
      nextFYEps: isNaN(ne) ? 0 : ne,
      supportRange: support.trim(),
      createdAt: editingEntry?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };

    if (editingEntry) {
      updateFundamentalEntry(editingEntry.id, entry);
    } else {
      addFundamentalEntry(entry);
    }
    onClose();
  };

  const handleDelete = () => {
    if (editingEntry) {
      removeFundamentalEntry(editingEntry.id);
    }
    onClose();
  };

  const now = new Date();
  const currentYear = now.getFullYear();
  const fm = parseInt(fiscalMonth, 10) || 12;
  const month = now.getMonth() + 1;
  const fyLabel = month >= fm ? `FY${currentYear + 1}` : `FY${currentYear}`;
  const nfyLabel = month >= fm ? `FY${currentYear + 2}` : `FY${currentYear + 1}`;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-[var(--tv-border)] bg-[var(--tv-bg)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-base font-semibold text-[var(--tv-text)]">
            {editingEntry ? "编辑基本面数据" : "新增基本面数据"}
          </h3>
          <button onClick={onClose} className="text-xl leading-none text-[var(--tv-text-secondary)] hover:text-[var(--tv-text)]">
            &times;
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 rounded border border-[var(--tv-red)]/30 bg-[var(--tv-red)]/10 px-3 py-2 text-sm text-[var(--tv-red)]">
            {errorMsg}
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">股票代码</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full rounded px-3 py-2 text-sm uppercase"
                placeholder="如 NVDA"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">财年截止月</label>
              <select
                value={fiscalMonth}
                onChange={(e) => setFiscalMonth(e.target.value)}
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
              <input value={peLow} onChange={(e) => setPeLow(e.target.value)} type="number" step="0.1" className="w-full rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">PE 上限</label>
              <input value={peHigh} onChange={(e) => setPeHigh(e.target.value)} type="number" step="0.1" className="w-full rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">PE 中位数</label>
              <input value={peMedian} onChange={(e) => setPeMedian(e.target.value)} type="number" step="0.1" className="w-full rounded px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">当前财年 EPS ({fyLabel})</label>
              <input value={currentEps} onChange={(e) => setCurrentEps(e.target.value)} type="number" step="0.01" className="w-full rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">下一财年 EPS ({nfyLabel})</label>
              <input value={nextEps} onChange={(e) => setNextEps(e.target.value)} type="number" step="0.01" className="w-full rounded px-3 py-2 text-sm" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">最近筹码强支撑</label>
            <input value={support} onChange={(e) => setSupport(e.target.value)} className="w-full rounded px-3 py-2 text-sm" placeholder="如 257-270 (中)" />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          {editingEntry ? (
            showDeleteConfirm ? (
              <div className="flex gap-2">
                <button onClick={handleDelete} className="rounded px-3 py-1.5 text-sm text-[var(--tv-red)] hover:underline">确认删除</button>
                <button onClick={() => setShowDeleteConfirm(false)} className="rounded px-3 py-1.5 text-sm text-[var(--tv-text-secondary)] hover:underline">取消</button>
              </div>
            ) : (
              <button onClick={() => setShowDeleteConfirm(true)} className="text-sm text-[var(--tv-text-secondary)] hover:text-[var(--tv-red)]">删除此行</button>
            )
          ) : (
            <div />
          )}
          <div className="flex gap-3">
            <button onClick={onClose} className="rounded px-4 py-1.5 text-sm text-[var(--tv-text-secondary)] hover:text-[var(--tv-text)]">取消</button>
            <button onClick={handleSave} className="rounded bg-[var(--tv-accent)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-80">
              {editingEntry ? "保存修改" : "添加"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
