"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/lib/store";

interface PriceEditModalProps {
  open: boolean;
  onClose: () => void;
}

interface Column {
  id: string;
  label: string;
  type: "stock" | "option";
}

export default function PriceEditModal({ open, onClose }: PriceEditModalProps) {
  const { snapshots, updateHistoricalPrices, deleteSnapshot, syncToJsonBin, holdings, optionHoldings } = useStore();
  const [pending, setPending] = useState<Map<string, Map<string, string>>>(new Map());
  const [newDates, setNewDates] = useState<string[]>([]);
  const [addDateInput, setAddDateInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [filterStart, setFilterStart] = useState("");
  const [filterEnd, setFilterEnd] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const columns = useMemo(() => {
    const seen = new Set<string>();
    const cols: Column[] = [];
    for (const s of snapshots) {
      for (const h of s.holdings) {
        if (!seen.has(h.id)) { seen.add(h.id); cols.push({ id: h.id, label: `${h.name} 现价`, type: "stock" }); }
      }
      for (const o of s.optionHoldings) {
        if (!seen.has(o.id)) { seen.add(o.id); cols.push({ id: o.id, label: `${o.name} 权利金`, type: "option" }); }
      }
    }
    for (const h of holdings) {
      if (!seen.has(h.id)) { seen.add(h.id); cols.push({ id: h.id, label: `${h.name} 现价`, type: "stock" }); }
    }
    for (const o of optionHoldings) {
      if (!seen.has(o.id)) { seen.add(o.id); cols.push({ id: o.id, label: `${o.name} 权利金`, type: "option" }); }
    }
    return cols;
  }, [snapshots, holdings, optionHoldings]);

  const existingDates = useMemo(() => {
    return [...new Set(snapshots.map((s) => s.date))].sort();
  }, [snapshots]);

  const allDates = useMemo(() => {
    const set = new Set(existingDates);
    for (const d of newDates) set.add(d);
    let list = [...set].sort();
    if (filterStart) list = list.filter((d) => d >= filterStart);
    if (filterEnd) list = list.filter((d) => d <= filterEnd);
    return list;
  }, [existingDates, newDates, filterStart, filterEnd]);

  useEffect(() => {
    if (!open) {
      setPending(new Map());
      setNewDates([]);
      setAddDateInput("");
      setSaving(false);
      setConfirmDelete(null);
    }
  }, [open]);

  function getOriginal(date: string, col: Column): number | null {
    const snap = snapshots.find((s) => s.date === date);
    if (!snap) return null;
    if (col.type === "stock") {
      const h = snap.holdings.find((x) => x.id === col.id);
      return h ? h.nowPrice : null;
    }
    const o = snap.optionHoldings.find((x) => x.id === col.id);
    return o ? o.nowPremium : null;
  }

  function getCellValue(date: string, col: Column): string {
    const byDate = pending.get(date);
    if (byDate?.has(col.id)) return byDate.get(col.id)!;
    const orig = getOriginal(date, col);
    return orig !== null ? String(orig) : "";
  }

  function setCellValue(date: string, col: Column, raw: string) {
    setPending((prev) => {
      const next = new Map(prev);
      const byDate = new Map(next.get(date) ?? new Map());
      if (raw === "") {
        byDate.delete(col.id);
      } else {
        byDate.set(col.id, raw);
      }
      if (byDate.size === 0) next.delete(date); else next.set(date, byDate);
      return next;
    });
  }

  function handleAddDate() {
    const trimmed = addDateInput.trim();
    if (!trimmed) return;
    if (allDates.includes(trimmed)) return;
    setNewDates((prev) => [...prev, trimmed]);
    setAddDateInput("");
  }

  function handleDeleteDate(date: string) {
    if (confirmDelete === date) {
      deleteSnapshot(date);
      setNewDates((prev) => prev.filter((d) => d !== date));
      setPending((prev) => {
        const next = new Map(prev);
        next.delete(date);
        return next;
      });
      setConfirmDelete(null);
    } else {
      setConfirmDelete(date);
    }
  }

  async function handleSave() {
    setSaving(true);
    const updates: { date: string; id: string; value: number; type: "stock" | "option" }[] = [];

    for (const [date, byDate] of pending) {
      for (const [id, raw] of byDate) {
        const val = parseFloat(raw);
        if (isNaN(val) || val <= 0) continue;
        const col = columns.find((c) => c.id === id);
        if (!col) continue;
        const orig = getOriginal(date, col);
        if (orig === val) continue;
        updates.push({ date, id, value: val, type: col.type });
      }
    }

    if (updates.length > 0) {
      updateHistoricalPrices(updates);
      syncToJsonBin();
    }
    setSaving(false);
    onClose();
  }

  if (!open) return null;

  const hasEdits = pending.size > 0;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="mx-4 flex max-h-[80vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-[var(--tv-border)] bg-[var(--tv-bg)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--tv-border)] px-6 py-4">
          <h3 className="text-base font-semibold text-[var(--tv-text)]">更新历史收盘价</h3>
          <button onClick={onClose} className="text-sm text-[var(--tv-text-secondary)] hover:text-[var(--tv-text)]">✕</button>
        </div>

        {/* 添加日期 */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--tv-border)] px-6 py-3">
          <span className="text-xs text-[var(--tv-text-secondary)]">添加日期：</span>
          <input
            type="date"
            value={addDateInput}
            onChange={(e) => setAddDateInput(e.target.value)}
            className="rounded border border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] px-2 py-1 text-sm text-[var(--tv-text)]"
          />
          <button
            onClick={handleAddDate}
            disabled={!addDateInput.trim() || allDates.includes(addDateInput.trim())}
            className="rounded bg-[#2962ff] px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
          >
            添加
          </button>
        </div>

        {/* 日期过滤 */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--tv-border)] px-6 py-2">
          <span className="text-xs text-[var(--tv-text-secondary)]">过滤：</span>
          <input
            type="date"
            value={filterStart}
            onChange={(e) => setFilterStart(e.target.value)}
            className="rounded border border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] px-2 py-1 text-xs text-[var(--tv-text)]"
          />
          <span className="text-xs text-[var(--tv-text-secondary)]">至</span>
          <input
            type="date"
            value={filterEnd}
            onChange={(e) => setFilterEnd(e.target.value)}
            className="rounded border border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] px-2 py-1 text-xs text-[var(--tv-text)]"
          />
          {(filterStart || filterEnd) && (
            <button
              onClick={() => { setFilterStart(""); setFilterEnd(""); }}
              className="text-xs text-[var(--tv-text-secondary)] hover:text-[var(--tv-text)]"
            >
              清除
            </button>
          )}
        </div>

        {/* 表格 */}
        <div className="flex-1 overflow-auto p-6">
          {allDates.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--tv-text-secondary)]">暂无数据</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-[var(--tv-text-secondary)]">
                    <th className="sticky left-0 z-10 bg-[var(--tv-bg)] py-2 pr-4 text-left">日期</th>
                    {columns.map((col) => (
                      <th key={`${col.type}-${col.id}`} className="px-2 py-2 text-right" title={col.id}>{col.label}</th>
                    ))}
                    <th className="w-10 px-2 py-2 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {allDates.map((date) => {
                    const isNew = !existingDates.includes(date);
                    return (
                      <tr key={date} className="border-t border-[var(--tv-border)]">
                        <td className="sticky left-0 z-10 bg-[var(--tv-bg)] py-2 pr-4 text-sm font-medium text-[var(--tv-text)]">
                          {date.slice(5)}
                          {isNew && <span className="ml-2 text-xs text-[#2962ff]">新</span>}
                        </td>
                        {columns.map((col) => {
                          const val = getCellValue(date, col);
                          const isPending = pending.get(date)?.has(col.id);
                          return (
                            <td key={`${date}-${col.type}-${col.id}`} className="px-2 py-1 text-right">
                              <input
                                type="number"
                                step="0.01"
                                value={val}
                                placeholder={getOriginal(date, col) !== null ? String(getOriginal(date, col)) : ""}
                                onChange={(e) => setCellValue(date, col, e.target.value)}
                                className={`w-full rounded border px-2 py-1 text-right text-sm ${
                                  isPending ? "border-[#2962ff] bg-[#2962ff]/10" : "border-transparent bg-transparent"
                                }`}
                              />
                            </td>
                          );
                        })}
                        <td className="px-2 py-1 text-right">
                          {confirmDelete === date ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDeleteDate(date)}
                                className="rounded bg-[var(--tv-red)] px-2 py-0.5 text-xs text-white"
                              >
                                确认
                              </button>
                              <button
                                onClick={() => setConfirmDelete(null)}
                                className="text-xs text-[var(--tv-text-secondary)]"
                              >
                                取消
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleDeleteDate(date)}
                              className="text-xs text-[var(--tv-text-secondary)] hover:text-[var(--tv-red)]"
                              title="删除此行"
                            >
                              🗑
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex justify-end gap-3 border-t border-[var(--tv-border)] px-6 py-4">
          <button onClick={onClose} disabled={saving} className="rounded px-4 py-2 text-sm text-[var(--tv-text-secondary)] hover:text-[var(--tv-text)]">
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasEdits}
            className="rounded bg-[#2962ff] px-6 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
