"use client";

import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts";
import { useStore } from "@/lib/store";
import JournalTimeline from "./JournalTimeline";
import type { StockHolding } from "@/types";

interface StockChartProps {
  holding: StockHolding;
}

export default function StockChart({ holding }: StockChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const { activeSnapshotIndex, snapshots } = useStore();
  const [journalOpen, setJournalOpen] = useState(false);

  const displayData =
    activeSnapshotIndex !== null && snapshots[activeSnapshotIndex]
      ? snapshots[activeSnapshotIndex]
      : null;

  const displayHolding = displayData
    ? displayData.holdings.find((h) => h.id === holding.id) || holding
    : holding;

  // 从快照中提取该股票在各时间点的收益率（与持仓总收益时间轴一致）
  const allPoints: { date: string; return: number }[] = [];
  for (const s of snapshots) {
    const h = s.holdings.find((sh) => sh.id === holding.id);
    if (h) allPoints.push({ date: s.date.slice(5), return: h.revenuePercentage });
  }

  useEffect(() => {
    if (!chartRef.current || allPoints.length === 0) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, undefined, {
        renderer: "canvas",
      });
    }

    const dates = allPoints.map((p) => p.date);
    const values = allPoints.map((p) => p.return);
    const currentReturn = values[values.length - 1] || 0;
    const hasManyPoints = dates.length > 30;

    chartInstance.current.setOption({
      backgroundColor: "transparent",
      grid: {
        left: 50,
        right: 16,
        top: 16,
        bottom: hasManyPoints ? 36 : 24,
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#1e222d",
        borderColor: "#2a2e39",
        textStyle: { color: "#d1d4dc", fontSize: 12 },
      },
      xAxis: {
        type: "category",
        data: dates,
        axisLine: { lineStyle: { color: "#2a2e39" } },
        axisLabel: { color: "#787b86", fontSize: 10 },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisLabel: {
          color: "#787b86",
          fontSize: 10,
          formatter: "{value}%",
        },
        splitLine: { lineStyle: { color: "#2a2e39", type: "dashed" } },
      },
      dataZoom: hasManyPoints
        ? [
            {
              type: "slider",
              show: true,
              bottom: 0,
              height: 20,
              borderColor: "#2a2e39",
              backgroundColor: "#1e222d",
              fillerColor: "rgba(8, 153, 129, 0.2)",
              handleStyle: { color: "#089981" },
              textStyle: { color: "#787b86", fontSize: 10 },
              labelFormatter: (value: number) => dates[value] || "",
            },
          ]
        : undefined,
      series: [
        {
          type: "line",
          data: values,
          smooth: true,
          showSymbol: false,
          lineStyle: {
            color: currentReturn >= 0 ? "#089981" : "#f23645",
            width: 2,
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              {
                offset: 0,
                color:
                  currentReturn >= 0
                    ? "rgba(8, 153, 129, 0.25)"
                    : "rgba(242, 54, 69, 0.25)",
              },
              { offset: 1, color: "transparent" },
            ]),
          },
        },
      ],
    });

    const handleResize = () => chartInstance.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [allPoints]);

  return (
    <>
      <div
        className="cursor-pointer rounded-lg border border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] p-4 transition-colors hover:border-[var(--tv-accent)]"
        onClick={() => setJournalOpen(true)}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <span className="font-semibold">{displayHolding.name}</span>
            <span className="ml-2 text-sm text-[var(--tv-text-secondary)]">
              {displayHolding.id}
            </span>
          </div>
          <div className="text-right">
            <div className={`text-sm font-medium ${displayHolding.revenuePercentage >= 0 ? "text-[var(--tv-green)]" : "text-[var(--tv-red)]"}`}>
              {displayHolding.revenuePercentage >= 0 ? "+" : ""}{displayHolding.revenuePercentage}%
            </div>
            <div className={`text-xs ${displayHolding.revenue >= 0 ? "text-[var(--tv-green)]" : "text-[var(--tv-red)]"}`}>
              {displayHolding.revenue >= 0 ? "+" : ""}${displayHolding.revenue.toLocaleString()}
            </div>
          </div>
        </div>
        <div className="mb-2 flex gap-4 text-xs text-[var(--tv-text-secondary)]">
          <span>持仓: {displayHolding.number} 股</span>
          <span>成本: ${displayHolding.price.toFixed(2)}</span>
          <span>现价: ${displayHolding.nowPrice.toFixed(2)}</span>
          <span>市值: ${displayHolding.total.toLocaleString()}</span>
        </div>
        <div ref={chartRef} className="h-36 w-full" />
      </div>

      <JournalTimeline
        stockId={holding.id}
        stockName={holding.name}
        open={journalOpen}
        onClose={() => setJournalOpen(false)}
      />
    </>
  );
}
