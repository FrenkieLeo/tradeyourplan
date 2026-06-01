"use client";

import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { fetchQuote } from "@/lib/alphavantage";
import type { TradeRecord } from "@/types";

interface TradeModalProps {
  open: boolean;
  onClose: () => void;
}

export default function TradeModal({ open, onClose }: TradeModalProps) {
  const { holdings, tradeRecords, cash, addTradeRecord, removeTradeRecord, updateTradeRecord, updatePrices } =
    useStore();

  const [stockName, setStockName] = useState("");
  const [stockId, setStockId] = useState("");
  const [number, setNumber] = useState("");
  const [price, setPrice] = useState("");
  const [tradeTime, setTradeTime] = useState("");
  const [editingTime, setEditingTime] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  const totalPages = Math.max(1, Math.ceil(tradeRecords.length / PAGE_SIZE));
  const paginatedRecords = tradeRecords.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  useEffect(() => {
    if (!open) {
      setStockName("");
      setStockId("");
      setNumber("");
      setPrice("");
      setTradeTime("");
      setEditingTime(null);
      setPage(1);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async () => {
    const num = parseFloat(number);
    const p = parseFloat(price);
    const time = parseInt(tradeTime.replace(/-/g, ""), 10);
    if (!stockName || !stockId || !num || !p || !time) return;

    const code = stockId.toUpperCase();
    const record: TradeRecord = {
      id: code,
      name: stockName,
      number: num,
      price: p,
      cost: Math.abs(num) * p,
      tradeTime: time,
    };

    if (editingTime !== null) {
      updateTradeRecord(editingTime, record);
    } else {
      addTradeRecord(record);
    }

    // 提交交易后立即拉取该股票前一日收盘价
    const quote = await fetchQuote(code);
    if (quote && quote.price > 0) {
      updatePrices([{ id: code, nowPrice: quote.price }]);
    }

    setStockName("");
    setStockId("");
    setNumber("");
    setPrice("");
    setTradeTime("");
    setEditingTime(null);
  };

  const startEdit = (r: TradeRecord) => {
    setStockName(r.name);
    setStockId(r.id);
    setNumber(String(r.number));
    setPrice(String(r.price));
    setTradeTime(String(r.tradeTime));
    setEditingTime(r.tradeTime);
  };

  const formatTime = (t: number) => {
    const s = String(t);
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  };

  const totalValue = holdings.reduce((s, h) => s + h.total, 0);
  const totalRevenue = holdings.reduce((s, h) => s + h.revenue, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-lg border border-[var(--tv-border)] bg-[var(--tv-bg)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold">交易记录</h2>
          <button onClick={onClose} className="text-[var(--tv-text-secondary)] hover:text-[var(--tv-text)] text-xl leading-none">&times;</button>
        </div>

        {/* 持仓概览 */}
        <div className="mb-6 grid grid-cols-3 gap-4 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] p-4">
          <div>
            <div className="text-xs text-[var(--tv-text-secondary)]">持仓总金额</div>
            <div className="text-lg font-semibold text-[var(--tv-text)]">
              ${totalValue.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--tv-text-secondary)]">剩余现金</div>
            <div className="text-lg font-semibold text-[var(--tv-text)]">
              ${cash.total.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--tv-text-secondary)]">持仓收益</div>
            <div className={`text-lg font-semibold ${totalRevenue >= 0 ? "text-[var(--tv-green)]" : "text-[var(--tv-red)]"}`}>
              {totalRevenue >= 0 ? "+" : ""}${totalRevenue.toLocaleString()}
            </div>
          </div>
        </div>

        {/* 当前持仓表 */}
        <div className="mb-6">
          <h3 className="mb-3 text-sm font-medium text-[var(--tv-text-secondary)]">当前持仓</h3>
          <table>
            <thead>
              <tr>
                <th className="pb-2">股票</th>
                <th className="pb-2">代码</th>
                <th className="pb-2">持股数</th>
                <th className="pb-2">成本价</th>
                <th className="pb-2">现价</th>
                <th className="pb-2">市值</th>
                <th className="pb-2">收益</th>
                <th className="pb-2">收益率</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <tr key={h.id} className="text-sm">
                  <td className="py-3">{h.name}</td>
                  <td className="py-3 text-[var(--tv-text-secondary)]">{h.id}</td>
                  <td className="py-3">{h.number}</td>
                  <td className="py-3">${h.price.toFixed(2)}</td>
                  <td className="py-3">${h.nowPrice.toFixed(2)}</td>
                  <td className="py-3">${h.total.toLocaleString()}</td>
                  <td className={`py-3 ${h.revenue >= 0 ? "text-[var(--tv-green)]" : "text-[var(--tv-red)]"}`}>
                    {h.revenue >= 0 ? "+" : ""}${h.revenue.toLocaleString()}
                  </td>
                  <td className={`py-3 ${h.revenuePercentage >= 0 ? "text-[var(--tv-green)]" : "text-[var(--tv-red)]"}`}>
                    {h.revenuePercentage >= 0 ? "+" : ""}{h.revenuePercentage}%
                  </td>
                </tr>
              ))}
              {holdings.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-sm text-[var(--tv-text-secondary)]">
                    暂无持仓
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 录入表单 */}
        <div className="mb-6 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] p-4">
          <h3 className="mb-3 text-sm font-medium text-[var(--tv-text-secondary)]">
            {editingTime ? "编辑交易" : "新增交易"}
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <input
              placeholder="股票名称"
              value={stockName}
              onChange={(e) => setStockName(e.target.value)}
              className="rounded px-3 py-2 text-sm"
            />
            <input
              placeholder="股票代码"
              value={stockId}
              onChange={(e) => setStockId(e.target.value)}
              className="rounded px-3 py-2 text-sm uppercase"
            />
            <input
              placeholder="数量（正买负卖）"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              type="number"
              className="rounded px-3 py-2 text-sm"
            />
            <input
              placeholder="成交价格"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              type="number"
              step="0.01"
              className="rounded px-3 py-2 text-sm"
            />
            <input
              placeholder="交易日期"
              value={tradeTime}
              onChange={(e) => setTradeTime(e.target.value)}
              type="date"
              className="rounded px-3 py-2 text-sm"
            />
            <button
              onClick={handleSubmit}
              className="rounded bg-[var(--tv-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-80"
            >
              {editingTime ? "保存修改" : "添加记录"}
            </button>
          </div>
        </div>

        {/* 交易记录表 */}
        <div>
          <h3 className="mb-3 text-sm font-medium text-[var(--tv-text-secondary)]">
            交易记录
            <span className="ml-2 text-xs font-normal text-[var(--tv-text-secondary)]">
              ({tradeRecords.length} 条)
            </span>
          </h3>
          <table>
            <thead>
              <tr>
                <th className="pb-2">股票</th>
                <th className="pb-2">代码</th>
                <th className="pb-2">数量</th>
                <th className="pb-2">价格</th>
                <th className="pb-2">金额</th>
                <th className="pb-2">日期</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {paginatedRecords.map((r) => (
                <tr key={`${r.tradeTime}-${r.id}`} className="text-sm">
                  <td className="py-3">{r.name}</td>
                  <td className="py-3 text-[var(--tv-text-secondary)]">{r.id}</td>
                  <td className={`py-3 ${r.number >= 0 ? "text-[var(--tv-green)]" : "text-[var(--tv-red)]"}`}>
                    {r.number >= 0 ? "+" : ""}{r.number}
                  </td>
                  <td className="py-3">${r.price.toFixed(2)}</td>
                  <td className="py-3">${r.cost.toLocaleString()}</td>
                  <td className="py-3 text-[var(--tv-text-secondary)]">{formatTime(r.tradeTime)}</td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <button onClick={() => startEdit(r)} className="text-xs text-[var(--tv-accent)] hover:underline">编辑</button>
                      <button onClick={() => removeTradeRecord(r.tradeTime)} className="text-xs text-[var(--tv-red)] hover:underline">删除</button>
                    </div>
                  </td>
                </tr>
              ))}
              {tradeRecords.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-[var(--tv-text-secondary)]">
                    暂无交易记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* 翻页 */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-end gap-2 text-sm">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded px-3 py-1 text-[var(--tv-text-secondary)] hover:text-[var(--tv-text)] disabled:opacity-30"
              >
                上一页
              </button>
              <span className="text-[var(--tv-text-secondary)]">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded px-3 py-1 text-[var(--tv-text-secondary)] hover:text-[var(--tv-text)] disabled:opacity-30"
              >
                下一页
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
