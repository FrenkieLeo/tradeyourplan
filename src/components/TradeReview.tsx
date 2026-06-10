"use client";

import { useMemo } from "react";
import { useStore, calcRealizedPnl } from "@/lib/store";
import type { TradeRecord } from "@/types";

interface ClosedPosition {
  id: string;
  name: string;
  buyAvg: number;
  sellAvg: number;
  totalQty: number;
  realizedPnl: number;
  returnPct: number;
  holdingDays: number;
  firstBuy: number;
  lastSell: number;
}

function analyzeClosedPositions(records: TradeRecord[]): ClosedPosition[] {
  const sorted = [...records].sort(
    (a, b) => a.tradeTime - b.tradeTime || (a.updatedAt ?? 0) - (b.updatedAt ?? 0)
  );

  const positions = new Map<string, {
    name: string;
    buys: { qty: number; price: number; time: number }[];
    sells: { qty: number; price: number; time: number }[];
  }>();

  for (const r of sorted) {
    if (r.assetType === "OPTION") continue;
    const pos = positions.get(r.id) ?? { name: r.name, buys: [], sells: [] };
    if (r.number > 0) {
      pos.buys.push({ qty: r.number, price: r.price, time: r.tradeTime });
    } else {
      pos.sells.push({ qty: Math.abs(r.number), price: r.price, time: r.tradeTime });
    }
    positions.set(r.id, pos);
  }

  const closed: ClosedPosition[] = [];
  for (const [id, pos] of positions) {
    if (pos.sells.length === 0) continue;
    const totalBuyQty = pos.buys.reduce((s, b) => s + b.qty, 0);
    const totalSellQty = pos.sells.reduce((s, s2) => s + s2.qty, 0);
    const soldQty = Math.min(totalBuyQty, totalSellQty);
    if (soldQty === 0) continue;

    const totalBuyCost = pos.buys.reduce((s, b) => s + b.qty * b.price, 0);
    const buyAvg = totalBuyCost / totalBuyQty;
    const totalSellValue = pos.sells.reduce((s, s2) => s + s2.qty * s2.price, 0);
    const sellAvg = totalSellValue / totalSellQty;

    const realizedPnl = (sellAvg - buyAvg) * soldQty;
    const returnPct = buyAvg > 0 ? ((sellAvg - buyAvg) / buyAvg) * 100 : 0;

    const firstBuy = pos.buys[0].time;
    const lastSell = pos.sells[pos.sells.length - 1].time;
    const parseTT = (t: number) => {
      const s = String(t);
      return new Date(parseInt(s.slice(0, 4)), parseInt(s.slice(4, 6)) - 1, parseInt(s.slice(6, 8)));
    };
    const holdingDays = Math.max(1, Math.round((parseTT(lastSell).getTime() - parseTT(firstBuy).getTime()) / 86400000));

    closed.push({ id, name: pos.name, buyAvg, sellAvg, totalQty: soldQty, realizedPnl, returnPct, holdingDays, firstBuy, lastSell });
  }

  return closed.sort((a, b) => b.lastSell - a.lastSell);
}

function formatTradeTime(t: number) {
  const s = String(t);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

export default function TradeReview() {
  const { tradeRecords, tradePlans } = useStore();
  const { total: realizedTotal, bySymbol } = calcRealizedPnl(tradeRecords);
  const closed = useMemo(() => analyzeClosedPositions(tradeRecords), [tradeRecords]);

  if (closed.length === 0) return null;

  const wins = closed.filter((c) => c.realizedPnl > 0);
  const losses = closed.filter((c) => c.realizedPnl <= 0);
  const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;
  const avgWin = wins.length > 0 ? wins.reduce((s, w) => s + w.returnPct, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, l) => s + l.returnPct, 0) / losses.length : 0;
  const avgHolding = closed.reduce((s, c) => s + c.holdingDays, 0) / closed.length;
  const profitFactor = losses.length > 0 && avgLoss !== 0
    ? Math.abs((wins.reduce((s, w) => s + w.realizedPnl, 0)) / (losses.reduce((s, l) => s + l.realizedPnl, 0)))
    : wins.length > 0 ? Infinity : 0;

  const planWinRates = tradePlans.filter((p) => p.winRate > 0 && !p.cancelled);
  const avgPlanWinRate = planWinRates.length > 0 ? planWinRates.reduce((s, p) => s + p.winRate, 0) / planWinRates.length : 0;

  return (
    <div className="rounded-lg border border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] p-4">
      <h2 className="mb-4 text-base font-semibold">交易复盘</h2>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded border border-[var(--tv-border)] bg-[var(--tv-bg)] p-3">
          <div className="text-xs text-[var(--tv-text-secondary)]">实际胜率</div>
          <div className={`text-xl font-bold ${winRate >= 50 ? "text-[var(--tv-green)]" : "text-[var(--tv-red)]"}`}>
            {winRate.toFixed(1)}%
          </div>
          {avgPlanWinRate > 0 && (
            <div className="text-[10px] text-[var(--tv-text-secondary)]">
              计划预估: {avgPlanWinRate.toFixed(0)}%
            </div>
          )}
        </div>
        <div className="rounded border border-[var(--tv-border)] bg-[var(--tv-bg)] p-3">
          <div className="text-xs text-[var(--tv-text-secondary)]">已实现盈亏</div>
          <div className={`text-xl font-bold ${realizedTotal >= 0 ? "text-[var(--tv-green)]" : "text-[var(--tv-red)]"}`}>
            {realizedTotal >= 0 ? "+" : ""}${realizedTotal.toLocaleString()}
          </div>
          <div className="text-[10px] text-[var(--tv-text-secondary)]">
            {wins.length}盈 / {losses.length}亏
          </div>
        </div>
        <div className="rounded border border-[var(--tv-border)] bg-[var(--tv-bg)] p-3">
          <div className="text-xs text-[var(--tv-text-secondary)]">盈亏比</div>
          <div className="text-xl font-bold text-[var(--tv-text)]">
            {profitFactor === Infinity ? "∞" : profitFactor.toFixed(2)}
          </div>
          <div className="text-[10px] text-[var(--tv-text-secondary)]">
            均盈 {avgWin.toFixed(1)}% / 均亏 {avgLoss.toFixed(1)}%
          </div>
        </div>
        <div className="rounded border border-[var(--tv-border)] bg-[var(--tv-bg)] p-3">
          <div className="text-xs text-[var(--tv-text-secondary)]">平均持仓天数</div>
          <div className="text-xl font-bold text-[var(--tv-text)]">
            {avgHolding.toFixed(0)}天
          </div>
          <div className="text-[10px] text-[var(--tv-text-secondary)]">
            已平仓 {closed.length} 笔
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-[var(--tv-border)]">
        <table className="min-w-full">
          <thead>
            <tr className="bg-[var(--tv-bg)]">
              <th className="px-3 py-2 text-left text-xs">股票</th>
              <th className="px-3 py-2 text-right text-xs">买入均价</th>
              <th className="px-3 py-2 text-right text-xs">卖出均价</th>
              <th className="px-3 py-2 text-right text-xs">数量</th>
              <th className="px-3 py-2 text-right text-xs">收益率</th>
              <th className="px-3 py-2 text-right text-xs">盈亏</th>
              <th className="px-3 py-2 text-right text-xs">持仓天数</th>
              <th className="px-3 py-2 text-right text-xs">卖出日期</th>
            </tr>
          </thead>
          <tbody>
            {closed.map((c) => (
              <tr key={`${c.id}-${c.lastSell}`} className="border-t border-[var(--tv-border)]">
                <td className="px-3 py-2 text-sm">
                  <span className="font-medium">{c.name}</span>
                  <span className="ml-1 text-xs text-[var(--tv-text-secondary)]">{c.id}</span>
                </td>
                <td className="px-3 py-2 text-right text-sm">${c.buyAvg.toFixed(2)}</td>
                <td className="px-3 py-2 text-right text-sm">${c.sellAvg.toFixed(2)}</td>
                <td className="px-3 py-2 text-right text-sm">{c.totalQty}</td>
                <td className={`px-3 py-2 text-right text-sm font-medium ${c.returnPct >= 0 ? "text-[var(--tv-green)]" : "text-[var(--tv-red)]"}`}>
                  {c.returnPct >= 0 ? "+" : ""}{c.returnPct.toFixed(2)}%
                </td>
                <td className={`px-3 py-2 text-right text-sm ${c.realizedPnl >= 0 ? "text-[var(--tv-green)]" : "text-[var(--tv-red)]"}`}>
                  {c.realizedPnl >= 0 ? "+" : ""}${c.realizedPnl.toFixed(2)}
                </td>
                <td className="px-3 py-2 text-right text-sm text-[var(--tv-text-secondary)]">{c.holdingDays}天</td>
                <td className="px-3 py-2 text-right text-sm text-[var(--tv-text-secondary)]">{formatTradeTime(c.lastSell)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
