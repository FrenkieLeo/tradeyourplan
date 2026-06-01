"use client";

import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { fetchQuote } from "@/lib/alphavantage";
import type { TradeRecord } from "@/types";

interface TradeModalProps {
  open: boolean;
  onClose: () => void;
}

type AssetType = "STOCK" | "OPTION";

export default function TradeModal({ open, onClose }: TradeModalProps) {
  const {
    stockHoldings,
    optionHoldings,
    tradeRecords,
    cash,
    addTradeRecord,
    removeTradeRecord,
    updateTradeRecord,
    updateStockPrices,
  } = useStore();

  // 资产类型选择
  const [assetType, setAssetType] = useState<AssetType>("STOCK");

  // 通用字段
  const [number, setNumber] = useState("");
  const [price, setPrice] = useState("");
  const [tradeTime, setTradeTime] = useState("");
  const [editingTime, setEditingTime] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  // 股票字段
  const [stockName, setStockName] = useState("");
  const [stockId, setStockId] = useState("");

  // 期权字段
  const [osiCode, setOsiCode] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [strikePrice, setStrikePrice] = useState("");
  const [optionType, setOptionType] = useState<"CALL" | "PUT">("CALL");
  const [direction, setDirection] = useState<"LONG" | "SHORT">("LONG");
  const [tradeType, setTradeType] = useState<
    "BUY" | "SELL" | "EXERCISE" | "ASSIGNED" | "EXPIRE_ZERO"
  >("BUY");

  const totalPages = Math.max(1, Math.ceil(tradeRecords.length / PAGE_SIZE));
  const paginatedRecords = tradeRecords.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  // OSI 代码自动填充
  const underlyingCode = osiCode.replace(/[^A-Za-z]/g, "").slice(0, 5);

  useEffect(() => {
    if (!open) {
      setAssetType("STOCK");
      setStockName("");
      setStockId("");
      setNumber("");
      setPrice("");
      setTradeTime("");
      setEditingTime(null);
      setPage(1);
      setOsiCode("");
      setExpiryDate("");
      setStrikePrice("");
      setOptionType("CALL");
      setDirection("LONG");
      setTradeType("BUY");
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async () => {
    const num = parseFloat(number);
    const p = parseFloat(price);
    const time = parseInt(tradeTime.replace(/-/g, ""), 10);
    if (!num || !p || !time) return;

    let record: TradeRecord;

    if (assetType === "STOCK") {
      if (!stockName || !stockId) return;
      const code = stockId.toUpperCase();
      record = {
        id: code,
        name: stockName,
        number: num,
        price: p,
        cost: Math.abs(num) * p,
        tradeTime: time,
        assetType: "STOCK",
        tradeType: num > 0 ? "BUY" : "SELL",
        multiplier: 1,
        totalCashImpact: -(num * p),
      };

      if (editingTime !== null) {
        updateTradeRecord(editingTime, record);
      } else {
        addTradeRecord(record);
      }

      // 拉取该股票前一日收盘价
      const quote = await fetchQuote(code);
      if (quote && quote.price > 0) {
        updateStockPrices([{ id: code, nowPrice: quote.price }]);
      }
    } else {
      // OPTION
      if (!osiCode) return;
      const code = osiCode.toUpperCase();
      const contractNumber = Math.abs(num);
      const directionSign = direction === "LONG" ? 1 : -1;

      // 根据 tradeType 和 direction 决定 number 的正负（兼容 addTradeRecord 的规范化逻辑）
      let recordNumber: number;
      let isLifecycle = false;

      if (tradeType === "BUY") {
        // 开/加仓：LONG → +n, SHORT → -n
        recordNumber = direction === "LONG" ? contractNumber : -contractNumber;
      } else if (tradeType === "SELL") {
        // 平/减仓：LONG → +n（平仓单, number>0 对应 normalize 中的 SELL 逻辑）
        // SHORT → -n（平仓单, number<0 对应 normalize 中的 BUY 逻辑）
        recordNumber = direction === "LONG" ? contractNumber : -contractNumber;
        // 对于 SELL 平仓，tradeType 已经设为 SELL；对于 SHORT 平仓，number<0 会被 normalize 标记为 BUY
        // 这里需要修正：SHORT 平仓应该是 BUY，LONG 平仓应该是 SELL
        // normalizeTradeRecord 中：tradeType 未设置时，number>0 → 'BUY', number<0 → 'SELL'
        // 但这里我们明确设置了 tradeType，所以 normalize 会保留我们的值
        // 我们需要确保：SHORT 平仓 (BUY with negative number)→ normalize: assetType=OPTION, tradeType=BUY, 但 number<0
        // 而 recalcOptionHoldings 中：tradeType==='BUY' && number<0 是减平 SHORT
        // 这正是我们要的！
      } else {
        // 生命周期事件
        isLifecycle = true;
        recordNumber = direction === "LONG" ? -contractNumber : contractNumber;
        // EXERCISE: LONG 持仓减少 (number<0), SHORT 持仓减少 (number>0)
        // ASSIGNED: 同上
        // EXPIRE_ZERO: 同上
        // 但 direction 表示的是当前持仓方向，不是操作方向
        // For EXERCISE of a LONG position: we are the option holder exercising → we LONG position decreases → negative number
        // For ASSIGNED of a SHORT position: we are the option writer being assigned → SHORT position decreases → positive number
        if (direction === "LONG") {
          recordNumber = -contractNumber;
        } else {
          recordNumber = contractNumber;
        }
      }

      const multiplier = 100;
      const totalCashImpact = isLifecycle
        ? 0
        : -(recordNumber * p * multiplier);

      record = {
        id: code,
        name: code,
        number: recordNumber,
        price: p,
        cost: contractNumber * p * multiplier,
        tradeTime: time,
        assetType: "OPTION",
        tradeType,
        multiplier,
        totalCashImpact,
      };

      if (editingTime !== null) {
        updateTradeRecord(editingTime, record);
      } else {
        addTradeRecord(record);
      }
    }

    // 重置表单
    setStockName("");
    setStockId("");
    setNumber("");
    setPrice("");
    setTradeTime("");
    setEditingTime(null);
    setOsiCode("");
    setExpiryDate("");
    setStrikePrice("");
    setOptionType("CALL");
    setDirection("LONG");
    setTradeType("BUY");
  };

  const startEdit = (r: TradeRecord) => {
    if (r.assetType === "OPTION") {
      setAssetType("OPTION");
      setOsiCode(r.id);
      setNumber(String(Math.abs(r.number)));
      setPrice(String(r.price));
      setTradeTime(String(r.tradeTime));
      setTradeType(r.tradeType || "BUY");
      setEditingTime(r.tradeTime);
      // 根据 number 符号推断 direction
      if (r.tradeType === "BUY") {
        setDirection(r.number > 0 ? "LONG" : "SHORT");
      } else if (r.tradeType === "SELL") {
        setDirection(r.number > 0 ? "LONG" : "SHORT");
      } else {
        // 生命周期事件，需要看原始持仓方向
        // 简单推断：r.number < 0 → LONG 减少, r.number > 0 → SHORT 减少
        setDirection(r.number < 0 ? "LONG" : "SHORT");
      }
      // OSI 解析
      const parsed = parseOsiId(r.id);
      if (parsed) {
        setExpiryDate(parsed.expiryDate);
        setStrikePrice(String(parsed.strikePrice));
        setOptionType(parsed.optionType);
      }
    } else {
      setAssetType("STOCK");
      setStockName(r.name);
      setStockId(r.id);
      setNumber(String(r.number));
      setPrice(String(r.price));
      setTradeTime(String(r.tradeTime));
      setEditingTime(r.tradeTime);
    }
  };

  const formatTime = (t: number) => {
    const s = String(t);
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  };

  // 辅助：解析 OSI
  function parseOsiId(osId: string) {
    const upper = osId.toUpperCase();
    const match = upper.match(
      /^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/,
    );
    if (match) {
      const yy = match[2],
        mm = match[3],
        dd = match[4];
      return {
        underlyingCode: match[1],
        expiryDate: `20${yy}-${mm}-${dd}`,
        optionType: match[5] as "CALL" | "PUT",
        strikePrice: parseInt(match[6], 10) / 1000,
      };
    }
    return null;
  }

  const autoFillOsi = () => {
    // 如果用户填写了 expiry / strike / optionType，自动构建 OSI
    if (!underlyingCode || !expiryDate || !strikePrice) return;
    const d = expiryDate.replace(/-/g, "");
    const yy = d.slice(2, 4);
    const mm = d.slice(4, 6);
    const dd = d.slice(6, 8);
    if (yy.length !== 2 || mm.length !== 2 || dd.length !== 2) return;
    const strikeStr = (parseFloat(strikePrice) * 1000).toFixed(0).padStart(8, "0");
    setOsiCode(`${underlyingCode.toUpperCase()}${yy}${mm}${dd}${optionType}${strikeStr}`);
  };

  const totalStockValue = stockHoldings.reduce((s, h) => s + h.total, 0);
  const totalOptionValue = optionHoldings.reduce((s, h) => s + h.total, 0);

  const tradeTypeLabel: Record<string, string> = {
    BUY: "买入",
    SELL: "卖出",
    EXERCISE: "行权",
    ASSIGNED: "被指派",
    EXPIRE_ZERO: "到期归零",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-lg border border-[var(--tv-border)] bg-[var(--tv-bg)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold">交易记录</h2>
          <button
            onClick={onClose}
            className="text-xl leading-none text-[var(--tv-text-secondary)] hover:text-[var(--tv-text)]"
          >
            &times;
          </button>
        </div>

        {/* 持仓概览 */}
        <div className="mb-6 grid grid-cols-4 gap-4 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] p-4">
          <div>
            <div className="text-xs text-[var(--tv-text-secondary)]">股票总市值</div>
            <div className="text-lg font-semibold text-[var(--tv-text)]">
              ${totalStockValue.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--tv-text-secondary)]">期权总市值</div>
            <div className="text-lg font-semibold text-[var(--tv-text)]">
              ${totalOptionValue.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--tv-text-secondary)]">剩余现金</div>
            <div className="text-lg font-semibold text-[var(--tv-text)]">
              ${cash.total.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--tv-text-secondary)]">净流动资产</div>
            <div className="text-lg font-semibold text-[var(--tv-text)]">
              ${(totalStockValue + totalOptionValue + cash.total).toLocaleString()}
            </div>
          </div>
        </div>

        {/* 当前持仓 */}
        <div className="mb-6">
          <h3 className="mb-3 text-sm font-medium text-[var(--tv-text-secondary)]">
            股票持仓
          </h3>
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-[var(--tv-text-secondary)]">
                <th className="pb-2 pr-2">股票</th>
                <th className="pb-2 pr-2">代码</th>
                <th className="pb-2 pr-2">数量</th>
                <th className="pb-2 pr-2">现价</th>
                <th className="pb-2 pr-2">市值</th>
                <th className="pb-2 pr-2">盈亏</th>
                <th className="pb-2 pr-2">收益率</th>
              </tr>
            </thead>
            <tbody>
              {stockHoldings.map((h) => (
                <tr key={h.id} className="text-sm">
                  <td className="py-1.5 pr-2">{h.name}</td>
                  <td className="py-1.5 pr-2 text-[var(--tv-text-secondary)]">
                    {h.id}
                  </td>
                  <td className="py-1.5 pr-2">{h.number}</td>
                  <td className="py-1.5 pr-2">
                    ${h.nowPrice.toFixed(2)}
                  </td>
                  <td className="py-1.5 pr-2">
                    ${h.total.toLocaleString()}
                  </td>
                  <td
                    className={`py-1.5 pr-2 ${h.revenue >= 0 ? "text-[var(--tv-green)]" : "text-[var(--tv-red)]"}`}
                  >
                    {h.revenue >= 0 ? "+" : ""}$
                    {h.revenue.toLocaleString()}
                  </td>
                  <td
                    className={`py-1.5 pr-2 ${h.revenuePercentage >= 0 ? "text-[var(--tv-green)]" : "text-[var(--tv-red)]"}`}
                  >
                    {h.revenuePercentage >= 0 ? "+" : ""}
                    {h.revenuePercentage}%
                  </td>
                </tr>
              ))}
              {stockHoldings.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="py-4 text-center text-sm text-[var(--tv-text-secondary)]"
                  >
                    暂无股票持仓
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 期权持仓 */}
        {optionHoldings.length > 0 && (
          <div className="mb-6">
            <h3 className="mb-3 text-sm font-medium text-[var(--tv-text-secondary)]">
              期权持仓
            </h3>
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-[var(--tv-text-secondary)]">
                  <th className="pb-2 pr-2">OSI 代码</th>
                  <th className="pb-2 pr-2">方向</th>
                  <th className="pb-2 pr-2">数量</th>
                  <th className="pb-2 pr-2">均价</th>
                  <th className="pb-2 pr-2">市值</th>
                  <th className="pb-2 pr-2">盈亏</th>
                </tr>
              </thead>
              <tbody>
                {optionHoldings.map((o) => (
                  <tr key={o.id} className="text-sm">
                    <td className="py-1.5 pr-2 font-mono text-xs">{o.id}</td>
                    <td className="py-1.5 pr-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          o.positionType === "SHORT"
                            ? "bg-[var(--tv-red)] text-white"
                            : "bg-[var(--tv-accent)] text-white"
                        }`}
                      >
                        {o.positionType}
                      </span>
                    </td>
                    <td className="py-1.5 pr-2">{o.number}</td>
                    <td className="py-1.5 pr-2">
                      ${o.price.toFixed(2)}
                    </td>
                    <td
                      className={`py-1.5 pr-2 ${o.total >= 0 ? "text-[var(--tv-green)]" : "text-[var(--tv-red)]"}`}
                    >
                      ${o.total.toLocaleString()}
                    </td>
                    <td
                      className={`py-1.5 pr-2 ${o.revenue >= 0 ? "text-[var(--tv-green)]" : "text-[var(--tv-red)]"}`}
                    >
                      {o.revenue >= 0 ? "+" : ""}$
                      {o.revenue.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 录入表单 */}
        <div className="mb-6 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] p-4">
          <h3 className="mb-3 text-sm font-medium text-[var(--tv-text-secondary)]">
            {editingTime ? "编辑交易" : "新增交易"}
          </h3>

          {/* 资产类型切换 */}
          <div className="mb-4 flex gap-2">
            <button
              className={`rounded px-3 py-1.5 text-xs font-medium ${
                assetType === "STOCK"
                  ? "bg-[var(--tv-accent)] text-white"
                  : "border border-[var(--tv-border)] text-[var(--tv-text-secondary)]"
              }`}
              onClick={() => setAssetType("STOCK")}
            >
              股票
            </button>
            <button
              className={`rounded px-3 py-1.5 text-xs font-medium ${
                assetType === "OPTION"
                  ? "bg-[var(--tv-accent)] text-white"
                  : "border border-[var(--tv-border)] text-[var(--tv-text-secondary)]"
              }`}
              onClick={() => setAssetType("OPTION")}
            >
              期权
            </button>
          </div>

          {assetType === "STOCK" ? (
            /* 股票表单 */
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <input
                placeholder="股票名称"
                value={stockName}
                onChange={(e) => setStockName(e.target.value)}
                className="rounded border border-[var(--tv-border)] bg-[var(--tv-bg-primary)] px-3 py-2 text-sm text-[var(--tv-text)] outline-none placeholder:text-[var(--tv-text-secondary)]"
              />
              <input
                placeholder="股票代码"
                value={stockId}
                onChange={(e) => setStockId(e.target.value)}
                className="rounded border border-[var(--tv-border)] bg-[var(--tv-bg-primary)] px-3 py-2 text-sm text-[var(--tv-text)] outline-none placeholder:text-[var(--tv-text-secondary)] uppercase"
              />
              <input
                placeholder="数量（正买负卖）"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                type="number"
                className="rounded border border-[var(--tv-border)] bg-[var(--tv-bg-primary)] px-3 py-2 text-sm text-[var(--tv-text)] outline-none placeholder:text-[var(--tv-text-secondary)]"
              />
              <input
                placeholder="成交价格"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                type="number"
                step="0.01"
                className="rounded border border-[var(--tv-border)] bg-[var(--tv-bg-primary)] px-3 py-2 text-sm text-[var(--tv-text)] outline-none placeholder:text-[var(--tv-text-secondary)]"
              />
              <input
                placeholder="交易日期"
                value={tradeTime}
                onChange={(e) => setTradeTime(e.target.value)}
                type="date"
                className="rounded border border-[var(--tv-border)] bg-[var(--tv-bg-primary)] px-3 py-2 text-sm text-[var(--tv-text)] outline-none placeholder:text-[var(--tv-text-secondary)]"
              />
              <button
                onClick={handleSubmit}
                className="rounded bg-[var(--tv-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-80"
              >
                {editingTime ? "保存修改" : "添加记录"}
              </button>
            </div>
          ) : (
            /* 期权表单 */
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="col-span-2">
                  <label className="mb-1 block text-[10px] text-[var(--tv-text-secondary)]">
                    OSI 代码
                  </label>
                  <input
                    placeholder="例: NVDA260619C00130000"
                    value={osiCode}
                    onChange={(e) => setOsiCode(e.target.value.toUpperCase())}
                    className="w-full rounded border border-[var(--tv-border)] bg-[var(--tv-bg-primary)] px-3 py-2 text-sm font-mono text-[var(--tv-text)] outline-none placeholder:text-[var(--tv-text-secondary)]"
                  />
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--tv-text-secondary)]">
                    <span>标的: {underlyingCode || "-"}</span>
                    <button
                      onClick={autoFillOsi}
                      className="text-[var(--tv-accent)] hover:underline"
                    >
                      自动生成 OSI
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-[var(--tv-text-secondary)]">
                    到期日
                  </label>
                  <input
                    value={expiryDate}
                    onChange={(e) => {
                      setExpiryDate(e.target.value);
                      if (e.target.value && strikePrice) autoFillOsi();
                    }}
                    type="date"
                    className="w-full rounded border border-[var(--tv-border)] bg-[var(--tv-bg-primary)] px-3 py-2 text-sm text-[var(--tv-text)] outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-[var(--tv-text-secondary)]">
                    行权价
                  </label>
                  <input
                    placeholder="行权价"
                    value={strikePrice}
                    onChange={(e) => {
                      setStrikePrice(e.target.value);
                      if (e.target.value && expiryDate) autoFillOsi();
                    }}
                    type="number"
                    step="0.001"
                    className="w-full rounded border border-[var(--tv-border)] bg-[var(--tv-bg-primary)] px-3 py-2 text-sm text-[var(--tv-text)] outline-none placeholder:text-[var(--tv-text-secondary)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <label className="mb-1 block text-[10px] text-[var(--tv-text-secondary)]">
                    类型
                  </label>
                  <div className="flex gap-1">
                    <button
                      className={`flex-1 rounded px-2 py-1.5 text-xs font-medium ${
                        optionType === "CALL"
                          ? "bg-[var(--tv-green)] text-white"
                          : "border border-[var(--tv-border)] text-[var(--tv-text-secondary)]"
                      }`}
                      onClick={() => setOptionType("CALL")}
                    >
                      Call
                    </button>
                    <button
                      className={`flex-1 rounded px-2 py-1.5 text-xs font-medium ${
                        optionType === "PUT"
                          ? "bg-[var(--tv-red)] text-white"
                          : "border border-[var(--tv-border)] text-[var(--tv-text-secondary)]"
                      }`}
                      onClick={() => setOptionType("PUT")}
                    >
                      Put
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-[var(--tv-text-secondary)]">
                    方向
                  </label>
                  <div className="flex gap-1">
                    <button
                      className={`flex-1 rounded px-2 py-1.5 text-xs font-medium ${
                        direction === "LONG"
                          ? "bg-[var(--tv-accent)] text-white"
                          : "border border-[var(--tv-border)] text-[var(--tv-text-secondary)]"
                      }`}
                      onClick={() => setDirection("LONG")}
                    >
                      Long
                    </button>
                    <button
                      className={`flex-1 rounded px-2 py-1.5 text-xs font-medium ${
                        direction === "SHORT"
                          ? "bg-[var(--tv-red)] text-white"
                          : "border border-[var(--tv-border)] text-[var(--tv-text-secondary)]"
                      }`}
                      onClick={() => setDirection("SHORT")}
                    >
                      Short
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-[var(--tv-text-secondary)]">
                    交易类型
                  </label>
                  <select
                    value={tradeType}
                    onChange={(e) => setTradeType(e.target.value as typeof tradeType)}
                    className="w-full rounded border border-[var(--tv-border)] bg-[var(--tv-bg-primary)] px-3 py-2 text-sm text-[var(--tv-text)] outline-none"
                  >
                    <option value="BUY">买入 (开仓)</option>
                    <option value="SELL">卖出 (平仓)</option>
                    <option value="EXERCISE">行权 (Exercise)</option>
                    <option value="ASSIGNED">被指派 (Assigned)</option>
                    <option value="EXPIRE_ZERO">到期归零</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-[var(--tv-text-secondary)]">
                    数量（张）
                  </label>
                  <input
                    placeholder="合约张数"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    type="number"
                    min="0"
                    className="w-full rounded border border-[var(--tv-border)] bg-[var(--tv-bg-primary)] px-3 py-2 text-sm text-[var(--tv-text)] outline-none placeholder:text-[var(--tv-text-secondary)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <label className="mb-1 block text-[10px] text-[var(--tv-text-secondary)]">
                    权利金单价
                  </label>
                  <input
                    placeholder="每股权利金"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full rounded border border-[var(--tv-border)] bg-[var(--tv-bg-primary)] px-3 py-2 text-sm text-[var(--tv-text)] outline-none placeholder:text-[var(--tv-text-secondary)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-[var(--tv-text-secondary)]">
                    交易日期
                  </label>
                  <input
                    value={tradeTime}
                    onChange={(e) => setTradeTime(e.target.value)}
                    type="date"
                    className="w-full rounded border border-[var(--tv-border)] bg-[var(--tv-bg-primary)] px-3 py-2 text-sm text-[var(--tv-text)] outline-none"
                  />
                </div>
                <div className="flex items-end">
                  <div className="text-[11px] text-[var(--tv-text-secondary)]">
                    现金影响:{" "}
                    <span className="font-medium text-[var(--tv-text)]">
                      {number && price
                        ? `$${(Math.abs(parseFloat(number) || 0) * (parseFloat(price) || 0) * 100).toLocaleString()}`
                        : "-"}
                    </span>
                  </div>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={handleSubmit}
                    className="w-full rounded bg-[var(--tv-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-80"
                  >
                    {editingTime ? "保存修改" : "添加记录"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 交易记录表 */}
        <div>
          <h3 className="mb-3 text-sm font-medium text-[var(--tv-text-secondary)]">
            交易记录
            <span className="ml-2 text-xs font-normal text-[var(--tv-text-secondary)]">
              ({tradeRecords.length} 条)
            </span>
          </h3>

          {/* 表头过滤器 */}
          <div className="mb-2 flex gap-3 text-[10px] text-[var(--tv-text-secondary)]">
            <span>全部</span>
            <span className="text-[var(--tv-accent)]">股票</span>
            <span className="text-[var(--tv-accent)]">期权</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="text-left text-xs text-[var(--tv-text-secondary)]">
                  <th className="pb-2 pr-2">类型</th>
                  <th className="pb-2 pr-2">代码 / OSI</th>
                  <th className="pb-2 pr-2">名称</th>
                  <th className="pb-2 pr-2">交易类型</th>
                  <th className="pb-2 pr-2">数量</th>
                  <th className="pb-2 pr-2">价格</th>
                  <th className="pb-2 pr-2">乘数</th>
                  <th className="pb-2 pr-2">金额</th>
                  <th className="pb-2 pr-2">现金影响</th>
                  <th className="pb-2 pr-2">日期</th>
                  <th className="pb-2 pr-2"></th>
                </tr>
              </thead>
              <tbody>
                {paginatedRecords.map((r) => (
                  <tr key={`${r.tradeTime}-${r.id}-${Math.random()}`} className="text-sm">
                    <td className="py-1.5 pr-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          r.assetType === "OPTION"
                            ? "bg-[var(--tv-accent)]/20 text-[var(--tv-accent)]"
                            : "bg-[var(--tv-text-secondary)]/20 text-[var(--tv-text-secondary)]"
                        }`}
                      >
                        {r.assetType === "OPTION" ? "期权" : "股票"}
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-xs text-[var(--tv-text-secondary)]">
                      {r.id}
                    </td>
                    <td className="py-1.5 pr-2">{r.name}</td>
                    <td className="py-1.5 pr-2">
                      <span className="text-[10px]">
                        {r.tradeType
                          ? tradeTypeLabel[r.tradeType] || r.tradeType
                          : r.number > 0
                            ? "买入"
                            : "卖出"}
                      </span>
                    </td>
                    <td
                      className={`py-1.5 pr-2 ${r.number >= 0 ? "text-[var(--tv-green)]" : "text-[var(--tv-red)]"}`}
                    >
                      {r.number >= 0 ? "+" : ""}
                      {r.number}
                    </td>
                    <td className="py-1.5 pr-2">
                      ${r.price.toFixed(2)}
                    </td>
                    <td className="py-1.5 pr-2 text-[var(--tv-text-secondary)]">
                      x{r.multiplier ?? 1}
                    </td>
                    <td className="py-1.5 pr-2">
                      ${r.cost.toLocaleString()}
                    </td>
                    <td
                      className={`py-1.5 pr-2 ${(r.totalCashImpact ?? 0) <= 0 ? "text-[var(--tv-red)]" : "text-[var(--tv-green)]"}`}
                    >
                      {(r.totalCashImpact ?? 0) >= 0 ? "+" : ""}$
                      {(r.totalCashImpact ?? 0).toLocaleString()}
                    </td>
                    <td className="py-1.5 pr-2 text-[var(--tv-text-secondary)]">
                      {formatTime(r.tradeTime)}
                    </td>
                    <td className="py-1.5 pr-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEdit(r)}
                          className="text-xs text-[var(--tv-accent)] hover:underline"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => removeTradeRecord(r.tradeTime)}
                          className="text-xs text-[var(--tv-red)] hover:underline"
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {tradeRecords.length === 0 && (
                  <tr>
                    <td
                      colSpan={11}
                      className="py-8 text-center text-sm text-[var(--tv-text-secondary)]"
                    >
                      暂无交易记录
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

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
