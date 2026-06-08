"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { fetchQuote } from "@/lib/alphavantage";
import type { FundamentalEntry } from "@/types";
import FundamentalModal from "./FundamentalModal";

function getFiscalYearLabels(fiscalMonth: number) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const month = now.getMonth() + 1;
  const fy = month >= fiscalMonth ? currentYear + 1 : currentYear;
  return { currentFY: `${fy % 100}财年`, nextFY: `${(fy + 1) % 100}财年` };
}

function formatPrice(v: number) {
  return v > 0 ? v.toFixed(2) : "—";
}

function formatRange(low: number, high: number) {
  if (low === 0 && high === 0) return "—";
  return `${low.toFixed(2)}-${high.toFixed(2)}`;
}

interface StockGroup {
  stockCode: string;
  entries: FundamentalEntry[];
}

export default function FundamentalList() {
  const { fundamentalEntries, holdings } = useStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<FundamentalEntry | null>(null);
  const [addStockCode, setAddStockCode] = useState<string | null>(null);
  const [marketPrices, setMarketPrices] = useState<Record<string, number>>({});
  const [fetchingPrices, setFetchingPrices] = useState<Set<string>>(new Set());

  const groups = useMemo<StockGroup[]>(() => {
    const map = new Map<string, FundamentalEntry[]>();
    for (const e of fundamentalEntries) {
      const arr = map.get(e.stockCode) ?? [];
      arr.push(e);
      map.set(e.stockCode, arr);
    }
    return [...map.entries()].map(([stockCode, entries]) => ({
      stockCode,
      entries: entries.sort((a, b) => a.createdAt - b.createdAt),
    }));
  }, [fundamentalEntries]);

  const holdingPriceMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const h of holdings) {
      if (h.nowPrice > 0) m[h.id] = h.nowPrice;
    }
    return m;
  }, [holdings]);

  useEffect(() => {
    const codes = new Set<string>();
    for (const g of groups) {
      if (!holdingPriceMap[g.stockCode] && !marketPrices[g.stockCode]) {
        codes.add(g.stockCode);
      }
    }
    if (codes.size === 0) return;

    let cancelled = false;
    (async () => {
      for (const code of codes) {
        if (cancelled) break;
        if (fetchingPrices.has(code)) continue;
        setFetchingPrices((prev) => new Set(prev).add(code));
        try {
          const quote = await fetchQuote(code);
          if (quote && quote.previousClose > 0 && !cancelled) {
            setMarketPrices((prev) => ({ ...prev, [code]: quote.previousClose }));
          }
        } catch { /* ignore */ }
        await new Promise((r) => setTimeout(r, 1200));
      }
    })();

    return () => { cancelled = true; };
  }, [groups, holdingPriceMap]);

  const getPrice = (code: string) => holdingPriceMap[code] ?? marketPrices[code] ?? 0;

  const openNew = (stockCode: string | null) => {
    setEditingEntry(null);
    setAddStockCode(stockCode);
    setModalOpen(true);
  };

  const openEdit = (entry: FundamentalEntry) => {
    setEditingEntry(entry);
    setAddStockCode(null);
    setModalOpen(true);
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">基本面跟踪清单</h2>
        <button
          onClick={() => openNew(null)}
          className="rounded bg-[var(--tv-accent)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-80"
        >
          + 新增
        </button>
      </div>

      <div className="overflow-x-auto rounded border border-[var(--tv-border)]">
        <table className="min-w-[1400px]">
          <thead>
            <tr className="bg-[var(--tv-bg-secondary)]">
              <th className="whitespace-nowrap px-3 py-3 text-left text-xs">股票</th>
              <th className="whitespace-nowrap px-3 py-3 text-left text-xs">财年月</th>
              <th className="whitespace-nowrap px-3 py-3 text-right text-xs">PE 下限</th>
              <th className="whitespace-nowrap px-3 py-3 text-right text-xs">PE 上限</th>
              <th className="whitespace-nowrap px-3 py-3 text-right text-xs">PE 中位</th>
              <th className="whitespace-nowrap px-3 py-3 text-right text-xs">当前财年 EPS</th>
              <th className="whitespace-nowrap px-3 py-3 text-right text-xs">当前财年价值交易价格</th>
              <th className="whitespace-nowrap px-3 py-3 text-right text-xs">当前财年中位价格</th>
              <th className="whitespace-nowrap px-3 py-3 text-left text-xs">最近筹码强支撑</th>
              <th className="whitespace-nowrap px-3 py-3 text-right text-xs">下一财年 EPS</th>
              <th className="whitespace-nowrap px-3 py-3 text-right text-xs">下一财年价值交易价格</th>
              <th className="whitespace-nowrap px-3 py-3 text-right text-xs">下一财年中位价格</th>
              <th className="sticky right-0 whitespace-nowrap bg-[var(--tv-bg-secondary)] px-3 py-3 text-right text-xs">市价</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr>
                <td colSpan={13} className="py-8 text-center text-sm text-[var(--tv-text-secondary)]">
                  暂无基本面数据，点击右上角「+ 新增」创建
                </td>
              </tr>
            )}
            {groups.map((group, gi) => {
              const price = getPrice(group.stockCode);
              const fyLabels = group.entries[0] ? getFiscalYearLabels(group.entries[0].fiscalYearEndMonth) : { currentFY: "", nextFY: "" };

              return group.entries.map((entry, ei) => {
                const currentValLow = entry.peLow * entry.currentFYEps;
                const currentValHigh = entry.peHigh * entry.currentFYEps;
                const currentMedianPrice = entry.peMedian * entry.currentFYEps;
                const nextValLow = entry.peLow * entry.nextFYEps;
                const nextValHigh = entry.peHigh * entry.nextFYEps;
                const nextMedianPrice = entry.peMedian * entry.nextFYEps;
                const isFirst = ei === 0;
                const isLast = ei === group.entries.length - 1;

                return (
                  <tr
                    key={entry.id}
                    className={`cursor-pointer hover:bg-[var(--tv-bg-secondary)] ${gi > 0 && isFirst ? "border-t-2 border-[var(--tv-border)]" : ""}`}
                    onClick={() => openEdit(entry)}
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 text-sm font-medium">
                      {isFirst ? group.stockCode : ""}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-sm text-[var(--tv-text-secondary)]">
                      {isFirst ? `${entry.fiscalYearEndMonth}月` : ""}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm">{formatPrice(entry.peLow)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm">{formatPrice(entry.peHigh)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm text-[var(--tv-yellow)]">{formatPrice(entry.peMedian)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm">{formatPrice(entry.currentFYEps)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm">
                      {entry.currentFYEps > 0 ? formatRange(currentValLow, currentValHigh) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm text-[var(--tv-yellow)]">
                      {entry.currentFYEps > 0 ? formatPrice(currentMedianPrice) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-sm text-[var(--tv-text-secondary)]">{entry.supportRange || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm">{formatPrice(entry.nextFYEps)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm">
                      {entry.nextFYEps > 0 ? formatRange(nextValLow, nextValHigh) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm text-[var(--tv-yellow)]">
                      {entry.nextFYEps > 0 ? formatPrice(nextMedianPrice) : "—"}
                    </td>
                    <td className="sticky right-0 whitespace-nowrap bg-[var(--tv-bg)] px-3 py-2.5 text-right text-sm font-medium">
                      {isFirst ? (
                        price > 0 ? (
                          <span className={price >= currentMedianPrice && currentMedianPrice > 0 ? "text-[var(--tv-red)]" : "text-[var(--tv-green)]"}>
                            {price.toFixed(2)}
                          </span>
                        ) : (
                          fetchingPrices.has(group.stockCode) ? (
                            <span className="text-[var(--tv-text-secondary)]">...</span>
                          ) : "—"
                        )
                      ) : ""}
                    </td>
                  </tr>
                );
              }).concat(
                <tr
                  key={`add-${group.stockCode}`}
                  className="cursor-pointer hover:bg-[var(--tv-bg-secondary)]"
                  onClick={() => openNew(group.stockCode)}
                >
                  <td colSpan={13} className="px-3 py-1.5 text-xs text-[var(--tv-accent)]">
                    + 为 {group.stockCode} 添加新行
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <FundamentalModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingEntry(null); setAddStockCode(null); }}
        stockCode={addStockCode}
        editingEntry={editingEntry}
      />
    </div>
  );
}
