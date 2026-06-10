"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";

interface ValuationBarProps {
  stockId: string;
  nowPrice: number;
}

export default function ValuationBar({ stockId, nowPrice }: ValuationBarProps) {
  const { fundamentalEntries } = useStore();

  const data = useMemo(() => {
    const entries = fundamentalEntries.filter((e) => e.stockCode === stockId && e.currentFYEps > 0);
    if (entries.length === 0) return null;

    const entry = entries[0];
    const low = entry.peLow * entry.currentFYEps;
    const high = entry.peHigh * entry.currentFYEps;
    const median = entry.peMedian * entry.currentFYEps;

    if (low <= 0 || high <= 0 || high <= low) return null;

    return { low, high, median };
  }, [fundamentalEntries, stockId]);

  if (!data || nowPrice <= 0) return null;

  const { low, high, median } = data;
  const margin = (high - low) * 0.25;
  const rangeMin = low - margin;
  const rangeMax = high + margin;
  const span = rangeMax - rangeMin;

  const toPercent = (v: number) => Math.max(0, Math.min(100, ((v - rangeMin) / span) * 100));

  const pricePct = toPercent(nowPrice);
  const lowPct = toPercent(low);
  const highPct = toPercent(high);
  const medianPct = toPercent(median);

  const marginOfSafety = ((median - nowPrice) / median) * 100;

  let zone: "undervalued" | "fair" | "overvalued";
  if (nowPrice <= low) zone = "undervalued";
  else if (nowPrice >= high) zone = "overvalued";
  else zone = "fair";

  const zoneConfig = {
    undervalued: { label: "低估", color: "text-[var(--tv-green)]", indicator: "bg-[var(--tv-green)]" },
    fair: { label: "合理", color: "text-[var(--tv-yellow)]", indicator: "bg-[var(--tv-yellow)]" },
    overvalued: { label: "高估", color: "text-[var(--tv-red)]", indicator: "bg-[var(--tv-red)]" },
  };

  const cfg = zoneConfig[zone];

  return (
    <div className="mt-2 mb-1">
      <div className="flex items-center justify-between mb-1">
        <span className={`text-[10px] font-medium ${cfg.color}`}>{cfg.label}</span>
        <span className={`text-[10px] ${marginOfSafety >= 0 ? "text-[var(--tv-green)]" : "text-[var(--tv-red)]"}`}>
          安全边际 {marginOfSafety >= 0 ? "+" : ""}{marginOfSafety.toFixed(1)}%
        </span>
      </div>
      <div className="relative h-2.5 w-full rounded-full bg-[var(--tv-bg)]">
        {/* Green zone (below low) */}
        <div
          className="absolute top-0 h-full rounded-l-full bg-[var(--tv-green)]/20"
          style={{ left: 0, width: `${lowPct}%` }}
        />
        {/* Yellow zone (low to high) */}
        <div
          className="absolute top-0 h-full bg-[var(--tv-yellow)]/20"
          style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%` }}
        />
        {/* Red zone (above high) */}
        <div
          className="absolute top-0 h-full rounded-r-full bg-[var(--tv-red)]/20"
          style={{ left: `${highPct}%`, width: `${100 - highPct}%` }}
        />
        {/* Median line */}
        <div
          className="absolute top-0 h-full w-px bg-[var(--tv-yellow)]/60"
          style={{ left: `${medianPct}%` }}
        />
        {/* Price indicator */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 h-3.5 w-1.5 rounded-sm ${cfg.indicator} shadow`}
          style={{ left: `${pricePct}%`, transform: `translateX(-50%) translateY(-50%)` }}
        />
      </div>
      <div className="mt-0.5 flex justify-between text-[9px] text-[var(--tv-text-secondary)]">
        <span>${low.toFixed(0)}</span>
        <span>${median.toFixed(0)}</span>
        <span>${high.toFixed(0)}</span>
      </div>
    </div>
  );
}
