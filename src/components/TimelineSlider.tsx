"use client";

import { useStore } from "@/lib/store";

export default function TimelineSlider() {
  const { snapshots, activeSnapshotIndex, setActiveSnapshot } = useStore();

  if (snapshots.length < 2) return null;

  const currentIndex = activeSnapshotIndex ?? snapshots.length - 1;

  const formatDate = (dateStr: string) => {
    const parts = dateStr.split("-");
    return `${parts[1]}/${parts[2]}`;
  };

  return (
    <div className="w-full px-2">
      <div className="mb-2 flex items-center justify-between text-xs text-[var(--tv-text-secondary)]">
        <span>{formatDate(snapshots[0].date)}</span>
        <span className="text-[var(--tv-text)]">
          {activeSnapshotIndex !== null
            ? `查看历史快照: ${formatDate(snapshots[currentIndex].date)}`
            : "最新"}
        </span>
        <span>{formatDate(snapshots[snapshots.length - 1].date)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={snapshots.length - 1}
        value={currentIndex}
        onChange={(e) => {
          const idx = parseInt(e.target.value, 10);
          setActiveSnapshot(idx < snapshots.length - 1 ? idx : null);
        }}
        className="w-full h-1 appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, var(--tv-accent) ${(currentIndex / (snapshots.length - 1)) * 100}%, var(--tv-border) ${(currentIndex / (snapshots.length - 1)) * 100}%)`,
          height: "4px",
          borderRadius: "2px",
          outline: "none",
        }}
      />
      <div className="mt-1 flex justify-between text-[10px] text-[var(--tv-text-secondary)]">
        {snapshots.filter((_, i) => i % Math.max(1, Math.floor(snapshots.length / 5)) === 0).map((s, i) => (
          <span key={s.timestamp}>{formatDate(s.date)}</span>
        ))}
      </div>
      {activeSnapshotIndex !== null && (
        <button
          onClick={() => setActiveSnapshot(null)}
          className="mt-2 text-xs text-[var(--tv-accent)] hover:underline"
        >
          返回最新
        </button>
      )}
    </div>
  );
}
