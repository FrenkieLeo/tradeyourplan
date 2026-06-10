"use client";

import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts";
import { useStore } from "@/lib/store";
import JournalTimeline from "./JournalTimeline";
import ValuationBar from "./ValuationBar";
import type { StockHolding } from "@/types";

interface StockChartProps {
  holding: StockHolding;
}

export default function StockChart({ holding }: StockChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const { activeSnapshotIndex, snapshots, isRefreshing } = useStore();
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

  if (typeof window !== "undefined" && snapshots.length > 0 && allPoints.length === 0) {
    console.warn(`[StockChart] ${holding.id}: snapshots exist but no matching data`);
  }

  useEffect(() => {
    if (!chartRef.current) return;
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, undefined, {
        renderer: "canvas",
      });
    }

    if (allPoints.length === 0) {
      chartInstance.current.clear();
      chartInstance.current.setOption({
        backgroundColor: "transparent",
        grid: { left: 50, right: 16, top: 16, bottom: 24 },
        xAxis: { type: "category", data: [], axisLine: { lineStyle: { color: "#2a2e39" } } },
        yAxis: { type: "value", axisLine: { show: false }, splitLine: { lineStyle: { color: "#2a2e39", type: "dashed" } } },
        series: [{ type: "line", data: [], showSymbol: false }],
      });
      return;
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
          showSymbol: values.length <= 2,
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
  }, [allPoints, isRefreshing]);

  return (
    <>
      <div
        className="cursor-pointer rounded-lg border border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] p-4 transition-colors hover:border-[var(--tv-accent)]"
        onClick={() => setJournalOpen(true)}
      >
        {isRefreshing ? (
          <div className="flex h-48 w-full items-center justify-center">
            <div className="text-center">
              <svg className="mx-auto mb-2 h-6 w-6 animate-spin text-[var(--tv-text-secondary)]" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <div className="text-sm text-[var(--tv-text-secondary)]">正在同步...</div>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <span className="font-semibold">{displayHolding.name}</span>
                <span className="ml-2 text-sm text-[var(--tv-text-secondary)]">
                  {displayHolding.id}
                </span>
              </div>
              <div className="text-right">
                <div className={`text-sm font-medium ${displayHolding.revenuePercentage >= 0 ? "text-[var(--tv-green)]" : "text-[var(--tv-red)]"}`}>
                  {displayHolding.nowPrice === 0 ? '--' : `${displayHolding.revenuePercentage >= 0 ? "+" : ""}${displayHolding.revenuePercentage}%`}
                </div>
                <div className={`text-xs ${displayHolding.revenue >= 0 ? "text-[var(--tv-green)]" : "text-[var(--tv-red)]"}`}>
                  {displayHolding.nowPrice === 0 ? '--' : `${displayHolding.revenue >= 0 ? "+" : ""}$${displayHolding.revenue.toLocaleString()}`}
                </div>
              </div>
            </div>
            <div className="mb-2 flex gap-4 text-xs text-[var(--tv-text-secondary)]">
              <span>持仓: {displayHolding.number} 股</span>
              <span>成本: ${displayHolding.price.toFixed(2)}</span>
              <span>现价: {displayHolding.nowPrice === 0 ? '--' : `$${displayHolding.nowPrice.toFixed(2)}`}</span>
              <span>市值: {displayHolding.total === 0 ? '--' : `$${displayHolding.total.toLocaleString()}`}</span>
            </div>
            <ValuationBar stockId={holding.id} nowPrice={displayHolding.nowPrice} />
            <div ref={chartRef} className="h-36 w-full" />
          </>
        )}
      </div>

      <JournalTimeline
        stockId={holding.id}
        stockName={holding.name}
        targetType="STOCK"
        open={journalOpen}
        onClose={() => setJournalOpen(false)}
      />
    </>
  );
}
