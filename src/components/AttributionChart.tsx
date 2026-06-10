"use client";

import { useEffect, useRef, useMemo } from "react";
import * as echarts from "echarts";
import { useStore } from "@/lib/store";

const PALETTE = [
  "#2962ff", "#089981", "#f23645", "#ff9800", "#9c27b0",
  "#00bcd4", "#cddc39", "#e91e63", "#3f51b5", "#4caf50",
];

export default function AttributionChart() {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const { snapshots, isRefreshing } = useStore();

  const data = useMemo(() => {
    if (snapshots.length < 2) return null;

    const allIds = new Set<string>();
    for (const s of snapshots) {
      for (const h of s.holdings) allIds.add(h.id);
    }

    const stockIds = [...allIds];
    const dates = snapshots.map((s) => s.date.slice(5));

    const series: { name: string; data: number[] }[] = stockIds.map((id) => {
      const values = snapshots.map((s) => {
        const h = s.holdings.find((h) => h.id === id);
        return h ? parseFloat(h.revenue.toFixed(2)) : 0;
      });
      const name = snapshots.find((s) => s.holdings.some((h) => h.id === id))
        ?.holdings.find((h) => h.id === id)?.name ?? id;
      return { name, data: values };
    });

    const optionIds = new Set<string>();
    for (const s of snapshots) {
      for (const o of s.optionHoldings) optionIds.add(o.id);
    }
    for (const id of optionIds) {
      const values = snapshots.map((s) => {
        const o = s.optionHoldings.find((o) => o.id === id);
        return o ? parseFloat(o.revenue.toFixed(2)) : 0;
      });
      const name = snapshots.find((s) => s.optionHoldings.some((o) => o.id === id))
        ?.optionHoldings.find((o) => o.id === id)?.name ?? id;
      series.push({ name, data: values });
    }

    return { dates, series };
  }, [snapshots]);

  useEffect(() => {
    if (!chartRef.current || !data) return;
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, undefined, { renderer: "canvas" });
    }

    const hasManyPoints = data.dates.length > 30;

    chartInstance.current.setOption({
      backgroundColor: "transparent",
      color: PALETTE,
      grid: {
        left: 50,
        right: 16,
        top: 30,
        bottom: hasManyPoints ? 56 : 44,
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#1e222d",
        borderColor: "#2a2e39",
        textStyle: { color: "#d1d4dc", fontSize: 12 },
        axisPointer: { type: "shadow" },
      },
      legend: {
        data: data.series.map((s) => s.name),
        top: 0,
        textStyle: { color: "#d1d4dc", fontSize: 10 },
        type: "scroll",
        pageTextStyle: { color: "#787b86" },
      },
      xAxis: {
        type: "category",
        data: data.dates,
        axisLine: { lineStyle: { color: "#2a2e39" } },
        axisLabel: { color: "#787b86", fontSize: 10 },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisLabel: {
          color: "#787b86",
          fontSize: 10,
          formatter: (v: number) => `$${v >= 0 ? "+" : ""}${v.toLocaleString()}`,
        },
        splitLine: { lineStyle: { color: "#2a2e39", type: "dashed" } },
      },
      dataZoom: hasManyPoints
        ? [{
            type: "slider",
            show: true,
            bottom: 0,
            height: 20,
            borderColor: "#2a2e39",
            backgroundColor: "#1e222d",
            fillerColor: "rgba(41, 98, 255, 0.2)",
            handleStyle: { color: "#2962ff" },
            textStyle: { color: "#787b86", fontSize: 10 },
          }]
        : undefined,
      series: data.series.map((s) => ({
        name: s.name,
        type: "bar",
        stack: "total",
        data: s.data,
        emphasis: { focus: "series" },
      })),
    }, true);

    const handleResize = () => chartInstance.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [data, isRefreshing]);

  if (!data) return null;

  return (
    <div className="rounded-lg border border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] p-4">
      <h2 className="mb-2 text-base font-semibold">收益归因</h2>
      <div ref={chartRef} className="h-56 w-full" />
    </div>
  );
}
