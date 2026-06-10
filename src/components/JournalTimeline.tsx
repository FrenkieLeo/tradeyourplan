"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import type { JournalEntry, JournalSentiment } from "@/types";

interface JournalTimelineProps {
  stockId: string;
  stockName: string;
  open: boolean;
  onClose: () => void;
  targetType?: "STOCK" | "OPTION";
}

const SENTIMENT_CONFIG: Record<JournalSentiment, { label: string; color: string; bg: string }> = {
  bullish: { label: "看多", color: "text-[var(--tv-green)]", bg: "bg-[var(--tv-green)]/15 border-[var(--tv-green)]/30" },
  bearish: { label: "看空", color: "text-[var(--tv-red)]", bg: "bg-[var(--tv-red)]/15 border-[var(--tv-red)]/30" },
  neutral: { label: "中性", color: "text-[var(--tv-yellow)]", bg: "bg-[var(--tv-yellow)]/15 border-[var(--tv-yellow)]/30" },
};

function getETDateNum(): number {
  const now = new Date();
  const et = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  return parseInt(et.replace(/-/g, ""), 10);
}

export default function JournalTimeline({
  stockId,
  stockName,
  open,
  onClose,
  targetType = "STOCK",
}: JournalTimelineProps) {
  const { journalEntries, addJournalEntry, updateJournalEntry, removeJournalEntry } = useStore();
  const [content, setContent] = useState("");
  const [sentiment, setSentiment] = useState<JournalSentiment>("neutral");
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editSentiment, setEditSentiment] = useState<JournalSentiment>("neutral");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  if (!open) return null;

  const entries = journalEntries
    .filter((e) => e.id === stockId)
    .sort((a, b) => b.time - a.time);

  const handleSubmit = () => {
    if (!content.trim()) return;
    addJournalEntry({
      id: stockId,
      targetType,
      name: stockName,
      time: getETDateNum(),
      content: content.trim(),
      sentiment,
    });
    setContent("");
    setSentiment("neutral");
  };

  const startEdit = (entry: JournalEntry) => {
    setEditingUid(entry.uid ?? null);
    setEditContent(entry.content);
    setEditSentiment(entry.sentiment ?? "neutral");
  };

  const saveEdit = () => {
    if (!editingUid || !editContent.trim()) return;
    updateJournalEntry(editingUid, { content: editContent.trim(), sentiment: editSentiment });
    setEditingUid(null);
  };

  const handleDelete = (uid: string) => {
    removeJournalEntry(uid);
    setConfirmDelete(null);
  };

  const formatTime = (t: number) => {
    const s = String(t);
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  };

  const SentimentPicker = ({ value, onChange, size = "sm" }: { value: JournalSentiment; onChange: (v: JournalSentiment) => void; size?: "sm" | "xs" }) => (
    <div className="flex gap-1.5">
      {(Object.keys(SENTIMENT_CONFIG) as JournalSentiment[]).map((s) => {
        const cfg = SENTIMENT_CONFIG[s];
        const active = value === s;
        return (
          <button
            key={s}
            onClick={() => onChange(s)}
            className={`rounded border px-2 ${size === "xs" ? "py-0.5 text-[10px]" : "py-1 text-xs"} font-medium transition-colors ${
              active ? `${cfg.bg} ${cfg.color}` : "border-[var(--tv-border)] text-[var(--tv-text-secondary)] hover:text-[var(--tv-text)]"
            }`}
          >
            {cfg.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-lg border border-[var(--tv-border)] bg-[var(--tv-bg)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{stockName} 看盘日志</h2>
          <button onClick={onClose} className="text-[var(--tv-text-secondary)] hover:text-[var(--tv-text)] text-xl leading-none">&times;</button>
        </div>

        <div className="mb-4">
          <textarea
            placeholder="记录今日看盘心得..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            className="w-full rounded px-3 py-2 text-sm resize-none"
          />
          <div className="mt-2 flex items-center justify-between">
            <SentimentPicker value={sentiment} onChange={setSentiment} />
            <button
              onClick={handleSubmit}
              className="rounded bg-[var(--tv-accent)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-80"
            >
              记录
            </button>
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="py-8 text-center text-sm text-[var(--tv-text-secondary)]">
            暂无看盘记录
          </div>
        ) : (
          <div className="relative pl-6">
            <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-[var(--tv-border)]" />

            {entries.map((entry, i) => {
              const isEditing = editingUid === entry.uid;
              const cfg = entry.sentiment ? SENTIMENT_CONFIG[entry.sentiment] : null;

              return (
                <div key={entry.uid ?? `${entry.time}-${i}`} className="group relative mb-6 last:mb-0">
                  <div className="absolute -left-[22px] top-1.5 h-3 w-3 rounded-full border-2 border-[var(--tv-accent)] bg-[var(--tv-bg)]" />

                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs text-[var(--tv-text-secondary)]">{formatTime(entry.time)}</span>
                    {cfg && (
                      <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${cfg.bg} ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="rounded border border-[var(--tv-accent)]/30 bg-[var(--tv-bg-secondary)] p-3">
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={3}
                        className="w-full rounded px-2 py-1.5 text-sm resize-none"
                      />
                      <div className="mt-2 flex items-center justify-between">
                        <SentimentPicker value={editSentiment} onChange={setEditSentiment} size="xs" />
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingUid(null)}
                            className="rounded px-3 py-1 text-xs text-[var(--tv-text-secondary)] hover:text-[var(--tv-text)]"
                          >
                            取消
                          </button>
                          <button
                            onClick={saveEdit}
                            className="rounded bg-[var(--tv-accent)] px-3 py-1 text-xs font-medium text-white hover:opacity-80"
                          >
                            保存
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded border border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] p-3 text-sm leading-relaxed">
                      {entry.content}
                      {entry.uid && (
                        <div className="mt-2 flex gap-3 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            onClick={() => startEdit(entry)}
                            className="text-xs text-[var(--tv-text-secondary)] hover:text-[var(--tv-accent)]"
                          >
                            编辑
                          </button>
                          {confirmDelete === entry.uid ? (
                            <span className="flex gap-2">
                              <button onClick={() => handleDelete(entry.uid!)} className="text-xs text-[var(--tv-red)] hover:underline">确认删除</button>
                              <button onClick={() => setConfirmDelete(null)} className="text-xs text-[var(--tv-text-secondary)] hover:underline">取消</button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(entry.uid!)}
                              className="text-xs text-[var(--tv-text-secondary)] hover:text-[var(--tv-red)]"
                            >
                              删除
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
