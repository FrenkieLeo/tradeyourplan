"use client";

import { useEffect, useRef, useMemo } from "react";
import * as echarts from "echarts";
import { useStore } from "@/lib/store";

const PALETTE = [
  "#2962ff", "#089981", "#f23645", "#ff9800", "#9c27b0",
  "#00bcd4", "#cddc39", "#e91e63", "#3f51b5", "#4caf50",
];

export default function AllocationChart() {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const { holdings, optionHoldings, cash, activeSnapshotIndex, snapshots, isRefreshing } = useStore();

  const displayData = activeSnapshotIndex !== null && snapshots[activeSnapshotIndex]
    ? snapshots[activeSnapshotIndex]
    : null;

  const displayHoldings = displayData ? displayData.holdings : holdings;
  const displayOptions = displayData ? displayData.optionHoldings : optionHoldings;
  const displayCash = displayData ? displayData.cash : cash;

  const items = useMemo(() => {
    const arr: { name: string; value: number }[] = [];
    for (const h of displayHoldings) {
      const v = h.total > 0 ? h.total : h.cost;
      if (v > 0) arr.push({ name: h.name || h.id, value: parseFloat(v.toFixed(2)) });
    }
    for (const o of displayOptions) {
      const v = o.currentValue > 0 ? o.currentValue : o.totalCost;
      if (v > 0) arr.push({ name: o.name || o.id, value: parseFloat(v.toFixed(2)) });
    }
    if (displayCash.total > 0) arr.push({ name: "现金", value: parseFloat(displayCash.total.toFixed(2)) });
    return arr;
  }, [displayHoldings, displayOptions, displayCash]);

  const totalAll = items.reduce((s, i) => s + i.value, 0);

  useEffect(() => {
    if (!chartRef.current) return;
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, undefined, { renderer: "canvas" });
    }
    chartInstance.current.setOption({
      backgroundColor: "transparent",
      color: PALETTE,
      tooltip: {
        trigger: "item",
        backgroundColor: "#1e222d",
        borderColor: "#2a2e39",
        textStyle: { color: "#d1d4dc", fontSize: 12 },
        formatter: (p: { name: string; value: number; percent: number }) =>
          `${p.name}<br/>$${p.value.toLocaleString()} (${p.percent}%)`,
      },
      legend: {
        type: "scroll",
        orient: "vertical",
        right: 8,
        top: "center",
        textStyle: { color: "#d1d4dc", fontSize: 12 },
        pageTextStyle: { color: "#787b86" },
      },
      series: [
        {
          type: "pie",
          radius: ["45%", "72%"],
          center: ["35%", "50%"],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: "#131722", borderWidth: 2 },
          label: { show: false },
          labelLine: { show: false },
          data: items,
        },
      ],
    }, true);

    const handleResize = () => chartInstance.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [JSON.stringify(items), isRefreshing]);

  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-semibold">资产配置</h2>
        <div className="flex items-center gap-2">
          {displayData && (
            <span className="text-[10px] text-[var(--tv-accent)]">{displayData.date}</span>
          )}
          <span className="text-xs text-[var(--tv-text-secondary)]">总计 ${totalAll.toLocaleString()}</span>
        </div>
      </div>
      <div ref={chartRef} className="h-56 w-full" />
    </div>
  );
}
