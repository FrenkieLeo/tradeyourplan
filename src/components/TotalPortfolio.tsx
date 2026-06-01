"use client";

import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts";
import { useStore } from "@/lib/store";
import TradeModal from "./TradeModal";
import CashModal from "./CashModal";

export default function TotalPortfolio() {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const { stockHoldings, optionHoldings, cash, snapshots, activeSnapshotIndex } = useStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [cashModalOpen, setCashModalOpen] = useState(false);

  const displayData =
    activeSnapshotIndex !== null && snapshots[activeSnapshotIndex]
      ? snapshots[activeSnapshotIndex]
      : null;

  const displayStock = displayData ? displayData.stockHoldings : stockHoldings;
  const displayOption = displayData ? displayData.optionHoldings : optionHoldings;
  const displayCash = displayData ? displayData.cash : cash;

  const stockTotal = displayStock.reduce((s, h) => s + h.total, 0);
  const optionTotal = displayOption.reduce((s, h) => s + h.total, 0);
  const netLiq = stockTotal + optionTotal + displayCash.total;
  const totalInvested = displayCash.initialCapital;
  const totalReturn = netLiq - totalInvested;
  const totalReturnPct =
    totalInvested > 0
      ? parseFloat(((totalReturn / totalInvested) * 100).toFixed(2))
      : 0;

  // 图表演示：snapshots 中的 netLiquidationValue 曲线
  useEffect(() => {
    if (!chartRef.current || snapshots.length === 0) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, undefined, {
        renderer: "canvas",
      });
    }

    const dates = snapshots.map((s) => s.date.slice(5));
    const values = snapshots.map((s) => s.netLiquidationValue);
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
        formatter: (params: { value: number }[] | { value: number }[][]) => {
          const items = Array.isArray(params[0]) ? params[0] : params;
          if (!items || !items[0]) return "";
          const val = (items[0] as { value: number }).value;
          return `<div>总资产净值: $${val.toLocaleString()}</div>`;
        },
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
          formatter: (v: number) => `$${(v / 1000).toFixed(0)}k`,
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
              fillerColor: "rgba(41, 98, 255, 0.2)",
              handleStyle: { color: "#2962ff" },
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
            color: "#2962ff",
            width: 2,
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "rgba(41, 98, 255, 0.3)" },
              { offset: 1, color: "rgba(41, 98, 255, 0.02)" },
            ]),
          },
        },
      ],
    });

    const handleResize = () => chartInstance.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [snapshots]);

  return (
    <>
      <div
        className="cursor-pointer rounded-lg border border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] p-4 transition-colors hover:border-[var(--tv-accent)]"
        onClick={() => setModalOpen(true)}
      >
        <h2 className="mb-4 text-base font-semibold">组合总资产</h2>

        {/* 三个核心数字 */}
        <div className="mb-4 grid grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-[var(--tv-text-secondary)]">总资产净值 (Net Liq)</div>
            <div className="text-xl font-bold text-[var(--tv-text)]">
              ${netLiq.toLocaleString()}
            </div>
          </div>
          <div
            className="cursor-pointer transition-colors hover:text-[var(--tv-accent)]"
            onClick={(e) => { e.stopPropagation(); setCashModalOpen(true); }}
          >
            <div className="text-xs text-[var(--tv-text-secondary)]">剩余现金</div>
            <div className="text-xl font-bold">
              ${displayCash.total.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--tv-text-secondary)]">
              组合总收益
              <span className={`ml-2 text-sm ${totalReturnPct >= 0 ? "text-[var(--tv-green)]" : "text-[var(--tv-red)]"}`}>
                {totalReturnPct >= 0 ? "+" : ""}{totalReturnPct}%
              </span>
            </div>
            <div className={`text-xl font-bold ${totalReturn >= 0 ? "text-[var(--tv-green)]" : "text-[var(--tv-red)]"}`}>
              {totalReturn >= 0 ? "+" : ""}${totalReturn.toLocaleString()}
            </div>
          </div>
        </div>

        {/* 图表 */}
        {snapshots.length === 0 ? (
          <div className="flex h-48 w-full items-center justify-center text-sm text-[var(--tv-text-secondary)]">
            {stockHoldings.length > 0 || optionHoldings.length > 0 ? "正在获取价格数据..." : "暂无持仓数据"}
          </div>
        ) : (
          <div ref={chartRef} className="h-48 w-full" />
        )}
      </div>

      <TradeModal open={modalOpen} onClose={() => setModalOpen(false)} />
      <CashModal open={cashModalOpen} onClose={() => setCashModalOpen(false)} />
    </>
  );
}
