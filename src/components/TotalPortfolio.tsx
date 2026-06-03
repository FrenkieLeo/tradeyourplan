"use client";

import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts";
import { useStore } from "@/lib/store";
import TradeModal from "./TradeModal";
import CashModal from "./CashModal";

export default function TotalPortfolio() {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const { holdings, optionHoldings, cash, dailyReturns, activeSnapshotIndex, snapshots, isRefreshing } = useStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [cashModalOpen, setCashModalOpen] = useState(false);

  const displayData =
    activeSnapshotIndex !== null && snapshots[activeSnapshotIndex]
      ? snapshots[activeSnapshotIndex]
      : null;

  const displayHoldings = displayData ? displayData.holdings : holdings;
  const displayOptionHoldings = displayData ? displayData.optionHoldings : optionHoldings;
  const displayCash = displayData ? displayData.cash : cash;

  const totalValue = displayHoldings.reduce((s, h) => s + h.total, 0) + displayOptionHoldings.reduce((s, o) => s + o.currentValue, 0);
  const totalCost = displayHoldings.reduce((s, h) => s + h.cost, 0) + displayOptionHoldings.reduce((s, o) => s + o.totalCost, 0);
  const totalRevenue = displayHoldings.reduce((s, h) => s + h.revenue, 0) + displayOptionHoldings.reduce((s, o) => s + o.revenue, 0);
  const totalReturn =
    totalCost > 0
      ? parseFloat(((totalRevenue / totalCost) * 100).toFixed(2))
      : 0;

  console.log("[TotalPortfolio] displayData:", {
    activeSnapshotIndex,
    hasSnapshot: !!displayData,
    displayHoldings: displayHoldings.map((h) => ({ id: h.id, nowPrice: h.nowPrice, price: h.price, number: h.number, cost: h.cost, revenue: h.revenue })),
    totalValue,
    totalCost,
    totalRevenue,
    totalReturn,
  });

  useEffect(() => {
    if (!chartRef.current) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, undefined, {
        renderer: "canvas",
      });
    }

    const dates = dailyReturns.map((d) => d.date.slice(5));
    const values = dailyReturns.map((d) => d.return);

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
          return `<div>收益: ${val >= 0 ? "+" : ""}$${val.toLocaleString()}</div>`;
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
          formatter: (v: number) => `$${v >= 0 ? "+" : ""}${v.toLocaleString()}`,
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
  }, [dailyReturns, isRefreshing]);

  return (
    <>
      <div
        className="cursor-pointer rounded-lg border border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] p-4 transition-colors hover:border-[var(--tv-accent)]"
        onClick={() => setModalOpen(true)}
      >
        <h2 className="mb-4 text-base font-semibold">持仓总收益</h2>

        {isRefreshing ? (
          <div className="flex h-64 w-full items-center justify-center">
            <div className="text-center">
              <svg className="mx-auto mb-3 h-8 w-8 animate-spin text-[#2962ff]" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <div className="text-sm text-[var(--tv-text-secondary)]">正在同步最新数据，请稍候...</div>
            </div>
          </div>
        ) : (
          <>
            {/* 三个核心数字 */}
            <div className="mb-4 grid grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-[var(--tv-text-secondary)]">持仓总金额</div>
                <div className="text-xl font-bold text-[var(--tv-text)]">
                  ${totalValue.toLocaleString()}
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
                  持仓收益
                  <span className={`ml-2 text-sm ${totalReturn >= 0 ? "text-[var(--tv-green)]" : "text-[var(--tv-red)]"}`}>
                    {totalReturn >= 0 ? "+" : ""}{totalReturn}%
                  </span>
                </div>
                <div className={`text-xl font-bold ${totalRevenue >= 0 ? "text-[var(--tv-green)]" : "text-[var(--tv-red)]"}`}>
                  {totalRevenue >= 0 ? "+" : ""}${totalRevenue.toLocaleString()}
                </div>
              </div>
            </div>

            {/* 图表 */}
            {dailyReturns.length === 0 ? (
              <div className="flex h-48 w-full items-center justify-center text-sm text-[var(--tv-text-secondary)]">
                {holdings.length > 0 ? "正在获取价格数据..." : "暂无持仓数据"}
              </div>
            ) : (
              <div ref={chartRef} className="h-48 w-full" />
            )}
          </>
        )}
      </div>

      <TradeModal open={modalOpen} onClose={() => setModalOpen(false)} />
      <CashModal open={cashModalOpen} onClose={() => setCashModalOpen(false)} />
    </>
  );
}
