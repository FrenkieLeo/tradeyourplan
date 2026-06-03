"use client";

import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts";
import { useStore } from "@/lib/store";
import JournalTimeline from "./JournalTimeline";
import OptionEditModal from "./OptionEditModal";
import type { OptionHolding } from "@/types";

interface OptionChartProps {
  option: OptionHolding;
}

export default function OptionChart({ option }: OptionChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const { activeSnapshotIndex, snapshots, isRefreshing } = useStore();
  const [journalOpen, setJournalOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const displayData =
    activeSnapshotIndex !== null && snapshots[activeSnapshotIndex]
      ? snapshots[activeSnapshotIndex]
      : null;

  const displayOption = displayData
    ? displayData.optionHoldings.find((o) => o.id === option.id) || option
    : option;

  const allPoints: { date: string; return: number }[] = [];
  for (const s of snapshots) {
    const o = s.optionHoldings.find((sh) => sh.id === option.id);
    if (o) allPoints.push({ date: s.date.slice(5), return: o.revenuePercentage });
  }

  if (typeof window !== "undefined") {
    console.log(`[OptionChart] ${option.id}: allPoints=${allPoints.length}, snapshots=${snapshots.length}`);
    if (snapshots.length > 0 && allPoints.length === 0) {
      console.warn(`[OptionChart] ${option.id}: snapshots exist but no matching option data. Check ID match: option.id=${option.id}, snapshot option IDs:`, snapshots[0].optionHoldings.map((o) => o.id));
    }
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
      <div className="rounded-lg border border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] p-4 transition-colors hover:border-[var(--tv-accent)]">
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
              <div className="flex items-center gap-2">
                <span className="font-semibold">{displayOption.name}</span>
                <span className="text-sm text-[var(--tv-text-secondary)]">
                  {displayOption.id}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); setJournalOpen(true); }}
                  className="rounded px-2 py-1 text-xs text-[var(--tv-text-secondary)] hover:text-[var(--tv-text)] hover:bg-[var(--tv-bg)] transition-colors"
                  title="看盘日志"
                >
                  📝
                </button>
                <div className="text-right">
                  <div className={`text-sm font-medium ${displayOption.revenuePercentage >= 0 ? "text-[var(--tv-green)]" : "text-[var(--tv-red)]"}`}>
                    {displayOption.revenuePercentage >= 0 ? "+" : ""}{displayOption.revenuePercentage}%
                  </div>
                  <div className={`text-xs ${displayOption.revenue >= 0 ? "text-[var(--tv-green)]" : "text-[var(--tv-red)]"}`}>
                    {displayOption.revenue >= 0 ? "+" : ""}${displayOption.revenue.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
            <div
              className="mb-2 cursor-pointer"
              onClick={() => setEditOpen(true)}
            >
              <div className="flex flex-wrap gap-3 text-xs text-[var(--tv-text-secondary)]">
                <span>{displayOption.type === "CALL" ? "看涨" : "看跌"} @ ${displayOption.strikePrice}</span>
                <span>到期: {displayOption.expirationDate}</span>
                <span>持仓: {displayOption.contracts} 张</span>
                <span>成本: ${displayOption.averagePremium.toFixed(2)}</span>
                <span className="text-[var(--tv-accent)] font-medium">现价: ${displayOption.nowPremium.toFixed(2)}</span>
                <span>价值: ${displayOption.currentValue.toLocaleString()}</span>
              </div>
              <div className="mt-1 text-xs text-[var(--tv-accent)]/60">点击更新最新权利金</div>
            </div>
            <div ref={chartRef} className="h-36 w-full" />
          </>
        )}
      </div>

      <OptionEditModal
        option={option}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      />

      <JournalTimeline
        stockId={option.id}
        stockName={option.name}
        targetType="OPTION"
        open={journalOpen}
        onClose={() => setJournalOpen(false)}
      />
    </>
  );
}
