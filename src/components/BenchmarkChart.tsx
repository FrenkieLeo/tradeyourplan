"use client";

import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts";
import { useStore } from "@/lib/store";
import { fetchDailyCloses, getETDate } from "@/lib/alphavantage";
import { getItem, setItem } from "@/lib/db";
import type { PortfolioSnapshot } from "@/types";

const BENCHMARKS: { sym: string; label: string; color: string }[] = [
  { sym: "SPY", label: "标普500 (SPY)", color: "#787b86" },
  { sym: "QQQ", label: "纳指100 (QQQ)", color: "#ff9800" },
];

function portfolioValue(s: PortfolioSnapshot): number {
  const stock = s.holdings.reduce((a, h) => a + (h.total || 0), 0);
  const opt = s.optionHoldings.reduce((a, o) => a + (o.currentValue || 0), 0);
  return stock + opt + (s.cash?.total ?? 0);
}

// 缓存日线（每个美东自然日只拉一次，省 API 配额）。
async function loadCloses(sym: string): Promise<Record<string, number>> {
  const today = getETDate();
  const cached = await getItem<{ day: string; closes: Record<string, number> }>(`benchmark:${sym}`);
  if (cached && cached.day === today && cached.closes && Object.keys(cached.closes).length) {
    return cached.closes;
  }
  const closes = await fetchDailyCloses(sym);
  if (Object.keys(closes).length) {
    await setItem(`benchmark:${sym}`, { day: today, closes });
    return closes;
  }
  return cached?.closes ?? {};
}

function closeForDate(closes: Record<string, number>, sortedDates: string[], date: string): number | null {
  if (closes[date] != null) return closes[date];
  // 最近的不晚于该日的交易日
  let result: number | null = null;
  for (const d of sortedDates) {
    if (d <= date) result = closes[d];
    else break;
  }
  return result;
}

export default function BenchmarkChart() {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const { snapshots, isRefreshing } = useStore();
  const [benchData, setBenchData] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const dates = snapshots.map((s) => s.date);

  useEffect(() => {
    if (snapshots.length < 2) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const acc: Record<string, Record<string, number>> = {};
      for (const b of BENCHMARKS) {
        const closes = await loadCloses(b.sym);
        acc[b.sym] = closes;
      }
      if (cancelled) return;
      setBenchData(acc);
      setFailed(Object.values(acc).every((m) => Object.keys(m).length === 0));
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshots.length, dates.join(",")]);

  useEffect(() => {
    if (!chartRef.current || snapshots.length < 2) return;
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, undefined, { renderer: "canvas" });
    }

    const base = portfolioValue(snapshots[0]) || 1;
    const portSeries = snapshots.map((s) => parseFloat(((portfolioValue(s) / base - 1) * 100).toFixed(2)));

    const series: echarts.LineSeriesOption[] = [
      {
        type: "line",
        name: "我的组合",
        data: portSeries,
        smooth: true,
        showSymbol: false,
        lineStyle: { color: "#2962ff", width: 2.5 },
      },
    ];

    for (const b of BENCHMARKS) {
      const closes = benchData[b.sym];
      if (!closes || Object.keys(closes).length === 0) continue;
      const sortedDates = Object.keys(closes).sort();
      const b0 = closeForDate(closes, sortedDates, dates[0]);
      if (!b0) continue;
      const data = dates.map((d) => {
        const c = closeForDate(closes, sortedDates, d);
        return c != null ? parseFloat(((c / b0 - 1) * 100).toFixed(2)) : null;
      });
      series.push({
        type: "line",
        name: b.label,
        data: data as number[],
        smooth: true,
        showSymbol: false,
        lineStyle: { color: b.color, width: 1.5, type: "dashed" },
      });
    }

    chartInstance.current.setOption({
      backgroundColor: "transparent",
      grid: { left: 44, right: 16, top: 30, bottom: 24 },
      legend: { top: 0, textStyle: { color: "#d1d4dc", fontSize: 11 } },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#1e222d",
        borderColor: "#2a2e39",
        textStyle: { color: "#d1d4dc", fontSize: 12 },
        valueFormatter: (v: number | null) => (v == null ? "-" : `${v >= 0 ? "+" : ""}${v}%`),
      },
      xAxis: {
        type: "category",
        data: dates.map((d) => d.slice(5)),
        axisLine: { lineStyle: { color: "#2a2e39" } },
        axisLabel: { color: "#787b86", fontSize: 10 },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisLabel: { color: "#787b86", fontSize: 10, formatter: (v: number) => `${v >= 0 ? "+" : ""}${v}%` },
        splitLine: { lineStyle: { color: "#2a2e39", type: "dashed" } },
      },
      series,
    }, true);

    const handleResize = () => chartInstance.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [snapshots, benchData, isRefreshing]);

  if (snapshots.length < 2) return null;

  return (
    <div className="rounded-lg border border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-semibold">基准对比</h2>
        <span className="text-xs text-[var(--tv-text-secondary)]">
          {loading ? "加载基准中..." : failed ? "基准数据暂不可用（API 限流）" : "区间累计收益率 vs 大盘"}
        </span>
      </div>
      <div ref={chartRef} className="h-56 w-full" />
    </div>
  );
}
