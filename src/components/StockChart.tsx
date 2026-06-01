"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as echarts from "echarts";
import { useStore } from "@/lib/store";
import type { StockHolding, OptionHolding } from "@/types";

interface Props {
  holding: StockHolding;
}

export default function StockChart({ holding }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const {
    optionHoldings,
    updateOptionPrices,
    snapshots,
    activeSnapshotIndex,
  } = useStore();

  const displayData =
    activeSnapshotIndex !== null && snapshots[activeSnapshotIndex]
      ? snapshots[activeSnapshotIndex]
      : null;

  const displayStock = displayData
    ? displayData.stockHoldings.find((s) => s.id === holding.id) || holding
    : holding;
  const displayOptions = displayData
    ? displayData.optionHoldings.filter((o) => o.underlyingCode === holding.id)
    : optionHoldings.filter((o) => o.underlyingCode === holding.id);

  const totalOptionMktValue = displayOptions.reduce(
    (s, o) => s + o.total,
    0,
  );

  // 单个股票 K 线数据（占位：这里使用持有均价模拟）
  useEffect(() => {
    if (!chartRef.current) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, undefined, {
        renderer: "canvas",
      });
    }

    const base = displayStock.price || 0;
    const now = displayStock.nowPrice || base;
    const range = base * 0.02 || 1;

    const data = [
      [base - range * 1.5, base - range * 0.8, base + range * 1.2, base - range * 1.0],
      [base - range * 1.2, base - range * 0.5, base + range * 0.8, base - range * 0.6],
      [base - range * 0.8, base - range * 0.3, base + range * 1.0, base + range * 0.2],
      [base - range * 0.6, base + 0, now, base - range * 0.4],
      [base - range * 1.0, base - range * 0.4, base + range * 0.6, base + range * 0.1],
      [base - range * 0.4, now - range * 0.2, now + range * 0.4, now],
    ];

    chartInstance.current.setOption({
      backgroundColor: "transparent",
      grid: { left: 40, right: 8, top: 8, bottom: 16 },
      xAxis: {
        type: "category",
        data: ["D-5", "D-4", "D-3", "D-2", "D-1", "今日"],
        axisLine: { lineStyle: { color: "#2a2e39" } },
        axisLabel: { color: "#787b86", fontSize: 9 },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisLabel: {
          color: "#787b86",
          fontSize: 9,
          formatter: (v: number) => `$${v.toFixed(1)}`,
        },
        splitLine: { lineStyle: { color: "#2a2e39", type: "dashed" } },
      },
      series: [
        {
          type: "candlestick",
          data,
          itemStyle: {
            color: "#089981",
            color0: "#f23645",
            borderColor: "#089981",
            borderColor0: "#f23645",
          },
        },
      ],
    });

    const handleResize = () => chartInstance.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [displayStock.price, displayStock.nowPrice]);

  // 股票仓位详情
  const stockTotalReturn = displayStock.revenue;
  const stockReturnPct = displayStock.revenuePercentage;

  return (
    <div className="rounded-lg border border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] p-4">
      {/* 标的标题行 */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-[var(--tv-text)]">
            {holding.id}
          </span>
          <span className="text-sm text-[var(--tv-text)]">
            ${displayStock.nowPrice.toFixed(2)}
          </span>
          <span
            className={`text-sm font-medium ${
              stockReturnPct >= 0
                ? "text-[var(--tv-green)]"
                : "text-[var(--tv-red)]"
            }`}
          >
            {stockReturnPct >= 0 ? "+" : ""}
            {stockReturnPct.toFixed(2)}%
          </span>
        </div>
        {displayOptions.length > 0 && (
          <div className="text-xs text-[var(--tv-text-secondary)]">
            期权总市值:{" "}
            <span
              className={
                totalOptionMktValue >= 0
                  ? "text-[var(--tv-green)]"
                  : "text-[var(--tv-red)]"
              }
            >
              ${totalOptionMktValue.toLocaleString()}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* 左侧：K线图 + 仓位详情 */}
        <div>
          <div ref={chartRef} className="h-40 w-full" />

          {/* 股票仓位详情 */}
          <div className="mt-1 grid grid-cols-3 gap-2 text-xs">
            <div>
              <span className="text-[var(--tv-text-secondary)]">持仓量: </span>
              <span className="text-[var(--tv-text)]">{displayStock.number}股</span>
            </div>
            <div>
            <span className="text-[var(--tv-text-secondary)]">均价: </span>
            <span className="text-[var(--tv-text)]">
                ${displayStock.price.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-[var(--tv-text-secondary)]">市值: </span>
              <span
                className={
                  stockTotalReturn >= 0
                    ? "text-[var(--tv-green)]"
                    : "text-[var(--tv-red)]"
                }
              >
                ${displayStock.total.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* 右侧：关联期权列表 */}
        <div>
          {displayOptions.length === 0 ? (
            <div
              className="mt-8 text-center text-xs text-[var(--tv-text-secondary)]"
            >
              无关联期权持仓
            </div>
          ) : (
            <div className="space-y-2">
              {displayOptions.map((opt) => (
                <OptionRow
                  key={opt.id}
                  option={opt}
                  onPriceChange={(newPrice) =>
                    updateOptionPrices([{ id: opt.id, nowPrice: newPrice }])
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 期权单行组件
function OptionRow({
  option,
  onPriceChange,
}: {
  option: OptionHolding;
  onPriceChange: (price: number) => void;
}) {
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceInput, setPriceInput] = useState(
    option.nowPrice?.toFixed(2) ?? "",
  );

  const handleSave = useCallback(() => {
    const v = parseFloat(priceInput);
    if (!isNaN(v) && v >= 0) {
      onPriceChange(v);
    }
    setEditingPrice(false);
  }, [priceInput, onPriceChange]);

  return (
    <div className="rounded bg-[var(--tv-bg-primary)] p-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium text-[var(--tv-text)]">
          {option.id}
        </span>
        <span className="rounded bg-[var(--tv-accent)] px-1.5 py-0.5 text-[10px] font-medium text-white">
          {option.positionType === "SHORT" ? "Short" : "Long"}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[var(--tv-text-secondary)]">
        <span>
          {option.optionType} {option.expiryDate}
          {option.strikePrice ? ` $${option.strikePrice}` : ""}
          {" | "}x{option.number}
        </span>
        <span
          className={
            option.total >= 0
              ? "text-[var(--tv-green)]"
              : "text-[var(--tv-red)]"
          }
        >
          Mkt ${option.total.toLocaleString()}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[var(--tv-text-secondary)]">成本: </span>
          <span className="text-[var(--tv-text)]">${option.price.toFixed(2)}</span>
        </div>
        {editingPrice ? (
          <div className="flex items-center gap-1">
            <input
              className="w-16 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-primary)] px-1 py-0.5 text-right text-xs text-[var(--tv-text)] outline-none"
              type="number"
              step="0.01"
              min="0"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") setEditingPrice(false);
              }}
              autoFocus
            />
            <button
              className="rounded bg-[var(--tv-accent)] px-1.5 py-0.5 text-[10px] text-white"
              onClick={handleSave}
            >
              确定
            </button>
          </div>
        ) : (
          <button
            className="cursor-pointer text-[var(--tv-accent)] hover:underline"
            onClick={() => {
              setPriceInput(option.nowPrice?.toFixed(2) ?? "");
              setEditingPrice(true);
            }}
          >
            {option.nowPrice !== undefined
              ? `Last: $${option.nowPrice.toFixed(2)}`
              : "输入价格"}
          </button>
        )}
      </div>
    </div>
  );
}
