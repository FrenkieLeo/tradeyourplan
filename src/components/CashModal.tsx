"use client";

import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import type { CashTxType } from "@/types";

interface CashModalProps {
  open: boolean;
  onClose: () => void;
}

const TYPE_LABELS: Record<CashTxType, string> = {
  DEPOSIT: "入金",
  WITHDRAW: "出金",
  DIVIDEND: "分红",
  INTEREST: "利息",
  FEE: "手续费",
};
const POSITIVE: CashTxType[] = ["DEPOSIT", "DIVIDEND", "INTEREST"];

function todayET(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export default function CashModal({ open, onClose }: CashModalProps) {
  const { cash, updateCash, cashTransactions, addCashTransaction, removeCashTransaction } = useStore();
  const [amount, setAmount] = useState("");

  // 新增流水表单
  const [txType, setTxType] = useState<CashTxType>("DEPOSIT");
  const [txAmount, setTxAmount] = useState("");
  const [txDate, setTxDate] = useState("");
  const [txNote, setTxNote] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAmount(String(cash.total));
      setTxDate(todayET());
      setConfirmDel(null);
    }
  }, [open, cash.total]);

  if (!open) return null;

  const handleSaveTotal = () => {
    const num = parseFloat(amount);
    if (isNaN(num)) return;
    updateCash(num);
    onClose();
  };

  const handleAddTx = () => {
    const num = parseFloat(txAmount);
    if (isNaN(num) || num <= 0 || !txDate) return;
    addCashTransaction({
      uid: "",
      type: txType,
      amount: num,
      date: txDate,
      note: txNote.trim() || undefined,
    });
    setTxAmount("");
    setTxNote("");
  };

  const sorted = [...cashTransactions].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="mx-4 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-[var(--tv-border)] bg-[var(--tv-bg)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--tv-border)] px-6 py-4">
          <h2 className="text-base font-semibold">现金与流水</h2>
          <button onClick={onClose} className="text-xl leading-none text-[var(--tv-text-secondary)] hover:text-[var(--tv-text)]">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* 当前现金 / 手动修正 */}
          <div className="mb-1 text-xs text-[var(--tv-text-secondary)]">当前现金（含交易与流水）</div>
          <div className="flex items-center gap-2">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              type="number"
              step="0.01"
              className="w-full rounded border border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] px-3 py-2 text-lg font-semibold outline-none focus:border-[var(--tv-accent)]"
            />
            <button
              onClick={handleSaveTotal}
              className="shrink-0 rounded bg-[var(--tv-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-80"
            >
              直接修正
            </button>
          </div>
          <div className="mt-1 text-[11px] text-[var(--tv-text-secondary)]">
            提示：日常入金/出金/分红等建议用下方「现金流水」记录，便于统计；「直接修正」用于一次性对账。
          </div>

          {/* 新增流水 */}
          <div className="mt-5 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] p-3">
            <div className="mb-2 text-sm font-medium text-[var(--tv-text-secondary)]">新增现金流水</div>
            <div className="flex flex-wrap gap-2">
              <select
                value={txType}
                onChange={(e) => setTxType(e.target.value as CashTxType)}
                className="rounded border border-[var(--tv-border)] bg-[var(--tv-bg)] px-2 py-1.5 text-sm"
              >
                {(Object.keys(TYPE_LABELS) as CashTxType[]).map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
              <input
                value={txAmount}
                onChange={(e) => setTxAmount(e.target.value)}
                type="number"
                step="0.01"
                placeholder="金额"
                className="w-24 rounded border border-[var(--tv-border)] bg-[var(--tv-bg)] px-2 py-1.5 text-sm"
              />
              <input
                value={txDate}
                onChange={(e) => setTxDate(e.target.value)}
                type="date"
                className="rounded border border-[var(--tv-border)] bg-[var(--tv-bg)] px-2 py-1.5 text-sm"
              />
              <input
                value={txNote}
                onChange={(e) => setTxNote(e.target.value)}
                placeholder="备注（可选）"
                className="min-w-[80px] flex-1 rounded border border-[var(--tv-border)] bg-[var(--tv-bg)] px-2 py-1.5 text-sm"
              />
              <button
                onClick={handleAddTx}
                disabled={!txAmount || parseFloat(txAmount) <= 0}
                className="rounded bg-[var(--tv-accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
              >
                添加
              </button>
            </div>
          </div>

          {/* 流水列表 */}
          <div className="mt-4">
            <div className="mb-2 text-sm font-medium text-[var(--tv-text-secondary)]">流水记录（{cashTransactions.length}）</div>
            {sorted.length === 0 ? (
              <div className="py-6 text-center text-sm text-[var(--tv-text-secondary)]">暂无流水</div>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {sorted.map((t) => {
                    const pos = POSITIVE.includes(t.type);
                    return (
                      <tr key={t.uid} className="border-t border-[var(--tv-border)]">
                        <td className="py-2 text-[var(--tv-text-secondary)]">{t.date.slice(5)}</td>
                        <td className="py-2">
                          <span className={`rounded px-1.5 py-0.5 text-xs ${pos ? "bg-[var(--tv-green)]/15 text-[var(--tv-green)]" : "bg-[var(--tv-red)]/15 text-[var(--tv-red)]"}`}>
                            {TYPE_LABELS[t.type]}
                          </span>
                          {t.note && <span className="ml-2 text-xs text-[var(--tv-text-secondary)]">{t.note}</span>}
                        </td>
                        <td className={`py-2 text-right font-medium ${pos ? "text-[var(--tv-green)]" : "text-[var(--tv-red)]"}`}>
                          {pos ? "+" : "-"}${Math.abs(t.amount).toLocaleString()}
                        </td>
                        <td className="py-2 pl-2 text-right">
                          {confirmDel === t.uid ? (
                            <span className="flex justify-end gap-1">
                              <button onClick={() => { removeCashTransaction(t.uid); setConfirmDel(null); }} className="text-xs text-[var(--tv-red)]">确认</button>
                              <button onClick={() => setConfirmDel(null)} className="text-xs text-[var(--tv-text-secondary)]">取消</button>
                            </span>
                          ) : (
                            <button onClick={() => setConfirmDel(t.uid)} className="text-xs text-[var(--tv-text-secondary)] hover:text-[var(--tv-red)]">删除</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="flex justify-end border-t border-[var(--tv-border)] px-6 py-3">
          <button onClick={onClose} className="rounded border border-[var(--tv-border)] px-4 py-2 text-sm text-[var(--tv-text-secondary)] hover:text-[var(--tv-text)]">
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
