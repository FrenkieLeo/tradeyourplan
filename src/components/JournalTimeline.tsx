"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import type { JournalEntry } from "@/types";

interface JournalTimelineProps {
  stockId: string;
  stockName: string;
  open: boolean;
  onClose: () => void;
  targetType?: "STOCK" | "OPTION";
}

export default function JournalTimeline({
  stockId,
  stockName,
  open,
  onClose,
  targetType = "STOCK",
}: JournalTimelineProps) {
  const { journalEntries, addJournalEntry } = useStore();
  const [content, setContent] = useState("");

  if (!open) return null;

  const entries = journalEntries
    .filter((e) => e.id === stockId)
    .sort((a, b) => b.time - a.time);

  const handleSubmit = () => {
    if (!content.trim()) return;
    const now = new Date();
    const time = parseInt(
      `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`,
      10
    );
    addJournalEntry({
      id: stockId,
      targetType,
      name: stockName,
      time,
      content: content.trim(),
    });
    setContent("");
  };

  const formatTime = (t: number) => {
    const s = String(t);
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  };

  const formatTimeShort = (t: number) => {
    const s = String(t);
    return `${s.slice(4, 6)}/${s.slice(6, 8)}`;
  };

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

        {/* 录入 */}
        <div className="mb-6 flex gap-3">
          <textarea
            placeholder="记录今日看盘心得..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            className="flex-1 rounded px-3 py-2 text-sm resize-none"
          />
          <button
            onClick={handleSubmit}
            className="self-end rounded bg-[var(--tv-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-80 h-fit"
          >
            记录
          </button>
        </div>

        {/* 时间轴 */}
        {entries.length === 0 ? (
          <div className="py-8 text-center text-sm text-[var(--tv-text-secondary)]">
            暂无看盘记录
          </div>
        ) : (
          <div className="relative pl-6">
            {/* 竖线 */}
            <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-[var(--tv-border)]" />

            {entries.map((entry, i) => (
              <div key={`${entry.time}-${i}`} className="relative mb-6 last:mb-0">
                {/* 节点圆点 */}
                <div className="absolute -left-[22px] top-1.5 h-3 w-3 rounded-full border-2 border-[var(--tv-accent)] bg-[var(--tv-bg)]" />

                {/* 日期标签 */}
                <div className="mb-1 text-xs text-[var(--tv-text-secondary)]">
                  {formatTime(entry.time)}
                </div>

                {/* 内容 */}
                <div className="rounded border border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] p-3 text-sm leading-relaxed">
                  {entry.content}
                </div>

                {/* 节点连线 */}
                {i < entries.length - 1 && (
                  <div className="absolute -left-[18px] top-4 w-3 h-[calc(100%+0.5rem)] border-l-2 border-dashed border-[var(--tv-border)]" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
