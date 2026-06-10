"use client";

import { useRef, useState } from "react";
import { useStore } from "@/lib/store";

export default function DataBackup() {
  const importData = useStore((s) => s.importData);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pendingDoc, setPendingDoc] = useState<unknown | null>(null);

  const flash = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(null), 3000);
  };

  const handleExport = () => {
    const s = useStore.getState();
    const doc = {
      tradeRecords: s.tradeRecords,
      tradePlans: s.tradePlans,
      megaCapResearches: s.megaCapResearches,
      fundamentalEntries: s.fundamentalEntries,
      journalEntries: s.journalEntries,
      snapshots: s.snapshots,
      dailyReturns: s.dailyReturns,
      cashTransactions: s.cashTransactions,
      deletedTradeUids: s.deletedTradeUids,
      deletedSnapshotDates: s.deletedSnapshotDates,
      deletedPlanIds: s.deletedPlanIds,
      deletedMegaCapResearchIds: s.deletedMegaCapResearchIds,
      deletedFundamentalEntryIds: s.deletedFundamentalEntryIds,
      deletedCashTxUids: s.deletedCashTxUids,
      baseCash: s.baseCash,
      baseCashUpdatedAt: s.baseCashUpdatedAt,
      holdings: s.holdings,
      optionHoldings: s.optionHoldings,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const name = `tradeyourplan-backup-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.json`;
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    flash("已导出备份");
  };

  const handlePickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      file.text().then((text) => {
        try {
          const parsed = JSON.parse(text);
          if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.tradeRecords)) {
            flash("文件格式不正确");
            return;
          }
          setPendingDoc(parsed);
        } catch {
          flash("无法解析该 JSON 文件");
        }
      });
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const confirmImport = async () => {
    if (pendingDoc == null) return;
    setBusy(true);
    try {
      await importData(pendingDoc);
      flash("已恢复备份");
    } catch {
      flash("恢复失败");
    } finally {
      setBusy(false);
      setPendingDoc(null);
    }
  };

  const recCount = pendingDoc && typeof pendingDoc === "object" && Array.isArray((pendingDoc as { tradeRecords?: unknown[] }).tradeRecords)
    ? (pendingDoc as { tradeRecords: unknown[] }).tradeRecords.length
    : 0;

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-[var(--tv-accent)]">{msg}</span>}
      <button
        onClick={handleExport}
        className="rounded px-2.5 py-1 text-xs font-medium text-[var(--tv-text-secondary)] transition-colors hover:bg-[var(--tv-bg-secondary)] hover:text-[var(--tv-text)]"
        title="把全部数据导出为 JSON 文件备份"
      >
        导出备份
      </button>
      <button
        onClick={() => fileRef.current?.click()}
        className="rounded px-2.5 py-1 text-xs font-medium text-[var(--tv-text-secondary)] transition-colors hover:bg-[var(--tv-bg-secondary)] hover:text-[var(--tv-text)]"
        title="从 JSON 备份文件恢复（会覆盖当前数据）"
      >
        导入恢复
      </button>
      <input ref={fileRef} type="file" accept="application/json,.json" onChange={handlePickFile} className="hidden" />

      {pendingDoc != null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={() => setPendingDoc(null)}>
          <div
            className="mx-4 w-full max-w-sm rounded-lg border border-[var(--tv-border)] bg-[var(--tv-bg)] p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-base font-semibold text-[var(--tv-text)]">确认恢复备份？</h3>
            <p className="mb-4 text-sm text-[var(--tv-text-secondary)]">
              将用该备份（含 {recCount} 条交易记录）<span className="text-[var(--tv-red)]">覆盖当前本地与云端数据</span>，此操作不可撤销。建议先点「导出备份」保存当前数据。
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setPendingDoc(null)}
                disabled={busy}
                className="rounded px-4 py-2 text-sm text-[var(--tv-text-secondary)] hover:text-[var(--tv-text)]"
              >
                取消
              </button>
              <button
                onClick={confirmImport}
                disabled={busy}
                className="rounded bg-[var(--tv-red)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy ? "恢复中..." : "确认覆盖恢复"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
