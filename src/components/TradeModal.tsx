"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/lib/store";
import type { TradeRecord } from "@/types";

interface TradeModalProps {
  open: boolean;
  onClose: () => void;
}

type TabType = "STOCK" | "OPTION";

export default function TradeModal({ open, onClose }: TradeModalProps) {
  const { holdings, optionHoldings, tradeRecords, cash, addTradeRecord, removeTradeRecord, updateTradeRecord } =
    useStore();

  const [tab, setTab] = useState<TabType>("STOCK");

  const [stockName, setStockName] = useState("");
  const [stockId, setStockId] = useState("");
  const [number, setNumber] = useState("");
  const [price, setPrice] = useState("");
  const [tradeTime, setTradeTime] = useState("");

  const [optionName, setOptionName] = useState("");
  const [optionId, setOptionId] = useState("");
  const [optionUnderlying, setOptionUnderlying] = useState("");
  const [optionType, setOptionType] = useState<"CALL" | "PUT">("CALL");
  const [optionStrike, setOptionStrike] = useState("");
  const [optionExpiration, setOptionExpiration] = useState("");
  const [optionContracts, setOptionContracts] = useState("");
  const [optionPremium, setOptionPremium] = useState("");

  const [editingTime, setEditingTime] = useState<number | null>(null);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalPages = Math.max(1, Math.ceil(tradeRecords.length / PAGE_SIZE));
  const paginatedRecords = tradeRecords.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  useEffect(() => {
    if (!open) {
      setTab("STOCK");
      setStockName(""); setStockId(""); setNumber(""); setPrice(""); setTradeTime("");
      setOptionName(""); setOptionId(""); setOptionUnderlying(""); setOptionType("CALL");
      setOptionStrike(""); setOptionExpiration(""); setOptionContracts(""); setOptionPremium("");
      setEditingTime(null); setEditingUid(null); setErrorMsg(null); setPage(1);
    }
  }, [open]);

  useEffect(() => {
    if (tab === "OPTION" && !tradeTime && !editingTime) {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      setTradeTime(`${y}-${m}-${day}`);
    }
  }, [tab, tradeTime, editingTime]);

  useEffect(() => {
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, []);

  const tryAutoSaveEdit = useCallback(() => {
    if (!editingUid) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (tab === "STOCK") {
        const num = parseFloat(number);
        const p = parseFloat(price);
        const time = parseInt(tradeTime.replace(/-/g, ""), 10);
        if (!stockName || !stockId || !num || !p || p <= 0 || !tradeTime) return;
        updateTradeRecord(editingUid!, {
          uid: editingUid!,
          id: stockId.toUpperCase(),
          assetType: "STOCK",
          name: stockName,
          number: num,
          price: p,
          cost: Math.abs(num) * p,
          tradeTime: time,
        });
      } else {
        const contracts = parseFloat(optionContracts);
        const premium = parseFloat(optionPremium);
        const strike = parseFloat(optionStrike);
        const time = parseInt(tradeTime.replace(/-/g, ""), 10);
        if (!optionName || !optionId || !optionUnderlying || !strike || !optionExpiration || !contracts || !premium || premium <= 0 || !tradeTime) return;
        updateTradeRecord(editingUid!, {
          uid: editingUid!,
          id: optionId.toUpperCase(),
          assetType: "OPTION",
          name: optionName,
          number: contracts,
          price: premium,
          cost: Math.abs(contracts) * premium * 100,
          tradeTime: time,
          underlyingSymbol: optionUnderlying.toUpperCase(),
          optionType,
          optionStrike: strike,
          optionExpiration,
        });
      }
    }, 600);
  }, [editingUid, tab, stockName, stockId, number, price, tradeTime, optionName, optionId, optionUnderlying, optionType, optionStrike, optionExpiration, optionContracts, optionPremium, updateTradeRecord]);

  useEffect(() => {
    if (editingUid) tryAutoSaveEdit();
  }, [stockName, stockId, number, price, tradeTime, optionName, optionId, optionUnderlying, optionType, optionStrike, optionExpiration, optionContracts, optionPremium]);

  if (!open) return null;

  const handleSubmitStock = () => {
    setErrorMsg(null);
    const num = parseFloat(number);
    const p = parseFloat(price);
    const time = parseInt(tradeTime.replace(/-/g, ""), 10);
    if (!stockName) { setErrorMsg("请输入股票名称"); return; }
    if (!stockId) { setErrorMsg("请输入股票代码"); return; }
    if (!num) { setErrorMsg("请输入有效的交易数量"); return; }
    if (!p || p <= 0) { setErrorMsg("请输入有效的成交价格"); return; }
    if (!tradeTime) { setErrorMsg("请选择交易日期"); return; }

    addTradeRecord({
      uid: "",
      id: stockId.toUpperCase(),
      assetType: "STOCK",
      name: stockName,
      number: num,
      price: p,
      cost: Math.abs(num) * p,
      tradeTime: time,
    });

    setStockName(""); setStockId(""); setNumber(""); setPrice(""); setTradeTime("");
    setEditingTime(null); setEditingUid(null);
  };

  const handleSubmitOption = () => {
    setErrorMsg(null);
    const contracts = parseFloat(optionContracts);
    const premium = parseFloat(optionPremium);
    const strike = parseFloat(optionStrike);
    const time = parseInt(tradeTime.replace(/-/g, ""), 10);
    if (!optionName) { setErrorMsg("请输入期权名称"); return; }
    if (!optionId) { setErrorMsg("请输入 OCC 代码"); return; }
    if (!optionUnderlying) { setErrorMsg("请输入正股代码"); return; }
    if (!strike || strike <= 0) { setErrorMsg("请输入有效的行权价"); return; }
    if (!optionExpiration) { setErrorMsg("请选择到期日"); return; }
    if (!contracts) { setErrorMsg("请输入有效的交易张数"); return; }
    if (!premium || premium <= 0) { setErrorMsg("请输入有效的权利金"); return; }
    if (!tradeTime) { setErrorMsg("请选择交易日期"); return; }

    addTradeRecord({
      uid: "",
      id: optionId.toUpperCase(),
      assetType: "OPTION",
      name: optionName,
      number: contracts,
      price: premium,
      cost: Math.abs(contracts) * premium * 100,
      tradeTime: time,
      underlyingSymbol: optionUnderlying.toUpperCase(),
      optionType,
      optionStrike: strike,
      optionExpiration,
    });

    setOptionName(""); setOptionId(""); setOptionUnderlying(""); setOptionType("CALL");
    setOptionStrike(""); setOptionExpiration(""); setOptionContracts(""); setOptionPremium("");
    setEditingTime(null); setEditingUid(null);
  };

  const formatTradeTime = (t: number) => {
    const s = String(t);
    if (s.length > 8) return new Date(t).toLocaleDateString("en-CA");
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  };

  const startEdit = (r: TradeRecord) => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    if (r.assetType === "OPTION") {
      setTab("OPTION");
      setOptionName(r.name); setOptionId(r.id); setOptionUnderlying(r.underlyingSymbol ?? "");
      setOptionType(r.optionType ?? "CALL"); setOptionStrike(String(r.optionStrike ?? ""));
      setOptionExpiration(r.optionExpiration ?? ""); setOptionContracts(String(r.number));
      setOptionPremium(String(r.price)); setTradeTime(formatTradeTime(r.tradeTime));
    } else {
      setTab("STOCK");
      setStockName(r.name); setStockId(r.id);
      setNumber(String(r.number)); setPrice(String(r.price));
      setTradeTime(formatTradeTime(r.tradeTime));
    }
    setEditingTime(r.tradeTime);
    setEditingUid(r.uid);
  };

  const formatTime = (t: number) => {
    const s = String(t);
    if (s.length > 8) return new Date(t).toLocaleDateString("en-CA");
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  };

  const cancelEdit = () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    setStockName(""); setStockId(""); setNumber(""); setPrice(""); setTradeTime("");
    setOptionName(""); setOptionId(""); setOptionUnderlying(""); setOptionType("CALL");
    setOptionStrike(""); setOptionExpiration(""); setOptionContracts(""); setOptionPremium("");
    setEditingTime(null); setEditingUid(null); setErrorMsg(null);
  };

  const handleClose = () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    onClose();
  };

  const totalValue = holdings.reduce((s, h) => s + h.total, 0) + optionHoldings.reduce((s, o) => s + o.currentValue, 0);
  const totalRevenue = holdings.reduce((s, h) => s + h.revenue, 0) + optionHoldings.reduce((s, o) => s + o.revenue, 0);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={handleClose}>
      <div
        className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-lg border border-[var(--tv-border)] bg-[var(--tv-bg)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold">交易记录</h2>
          <button onClick={handleClose} className="text-[var(--tv-text-secondary)] hover:text-[var(--tv-text)] text-xl leading-none">&times;</button>
        </div>

        {/* 持仓概览 */}
        <div className="mb-6 grid grid-cols-3 gap-4 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] p-4">
          <div>
            <div className="text-xs text-[var(--tv-text-secondary)]">持仓总金额</div>
            <div className="text-lg font-semibold text-[var(--tv-text)]">${totalValue.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-xs text-[var(--tv-text-secondary)]">剩余现金</div>
            <div className="text-lg font-semibold text-[var(--tv-text)]">${cash.total.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-xs text-[var(--tv-text-secondary)]">持仓收益</div>
            <div className={`text-lg font-semibold ${totalRevenue >= 0 ? "text-[var(--tv-green)]" : "text-[var(--tv-red)]"}`}>
              {totalRevenue >= 0 ? "+" : ""}${totalRevenue.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Tab 切换 */}
        <div className="mb-6 flex gap-1 rounded-lg border border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] p-1">
          <button
            onClick={() => { setTab("STOCK"); cancelEdit(); }}
            className={`flex-1 rounded px-4 py-2 text-sm font-medium transition-colors ${
              tab === "STOCK" ? "bg-[var(--tv-accent)] text-white" : "text-[var(--tv-text-secondary)] hover:text-[var(--tv-text)]"
            }`}
          >
            股票交易
          </button>
          <button
            onClick={() => { setTab("OPTION"); cancelEdit(); }}
            className={`flex-1 rounded px-4 py-2 text-sm font-medium transition-colors ${
              tab === "OPTION" ? "bg-[var(--tv-accent)] text-white" : "text-[var(--tv-text-secondary)] hover:text-[var(--tv-text)]"
            }`}
          >
            期权交易
          </button>
        </div>

        {/* 当前持仓表 */}
        <div className="mb-6">
          <h3 className="mb-3 text-sm font-medium text-[var(--tv-text-secondary)]">
            {tab === "STOCK" ? "当前股票持仓" : "当前期权持仓"}
          </h3>
          {tab === "STOCK" ? (
            <table className="w-full">
              <thead>
                <tr className="text-xs text-[var(--tv-text-secondary)]">
                  <th className="py-3 text-left">股票</th><th className="py-3 text-right">代码</th><th className="py-3 text-right">持股数</th><th className="py-3 text-right">成本价</th><th className="py-3 text-right">现价</th><th className="py-3 text-right">市值</th><th className="py-3 text-right">收益</th><th className="py-3 text-right">收益率</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => (
                  <tr key={h.id} className="text-sm">
                    <td className="py-3">{h.name}</td>
                    <td className="py-3 text-right text-[var(--tv-text-secondary)]">{h.id}</td>
                    <td className="py-3 text-right">{h.number}</td>
                    <td className="py-3 text-right">${h.price.toFixed(2)}</td>
                    <td className="py-3 text-right">{h.nowPrice === 0 ? '--' : `$${h.nowPrice.toFixed(2)}`}</td>
                    <td className="py-3 text-right">{h.total === 0 ? '--' : `$${h.total.toLocaleString()}`}</td>
                    <td className={`py-3 text-right ${h.revenue >= 0 ? "text-[var(--tv-green)]" : "text-[var(--tv-red)]"}`}>
                      {h.nowPrice === 0 ? '--' : `${h.revenue >= 0 ? "+" : ""}$${h.revenue.toLocaleString()}`}
                    </td>
                    <td className={`py-3 text-right ${h.revenuePercentage >= 0 ? "text-[var(--tv-green)]" : "text-[var(--tv-red)]"}`}>
                      {h.nowPrice === 0 ? '--' : `${h.revenuePercentage >= 0 ? "+" : ""}${h.revenuePercentage}%`}
                    </td>
                  </tr>
                ))}
                {holdings.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-sm text-[var(--tv-text-secondary)]">暂无股票持仓</td></tr>}
              </tbody>
            </table>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-xs text-[var(--tv-text-secondary)]">
                  <th className="py-3 text-left">名称</th><th className="py-3 text-right">代码</th><th className="py-3 text-right">类型</th><th className="py-3 text-right">行权价</th><th className="py-3 text-right">到期日</th><th className="py-3 text-right">张数</th><th className="py-3 text-right">权利金</th><th className="py-3 text-right">价值</th><th className="py-3 text-right">收益</th>
                </tr>
              </thead>
              <tbody>
                {optionHoldings.map((o) => (
                  <tr key={o.id} className="text-sm">
                    <td className="py-3">{o.name}</td>
                    <td className="py-3 text-right text-[var(--tv-text-secondary)]">{o.id}</td>
                    <td className="py-3 text-right">{o.type === "CALL" ? "看涨" : "看跌"}</td>
                    <td className="py-3 text-right">${o.strikePrice.toFixed(2)}</td>
                    <td className="py-3 text-right">{o.expirationDate}</td>
                    <td className="py-3 text-right">{o.contracts}</td>
                    <td className="py-3 text-right">${o.averagePremium.toFixed(2)}</td>
                    <td className="py-3 text-right">${o.currentValue.toLocaleString()}</td>
                    <td className={`py-3 text-right ${o.revenue >= 0 ? "text-[var(--tv-green)]" : "text-[var(--tv-red)]"}`}>
                      {o.revenue >= 0 ? "+" : ""}${o.revenue.toLocaleString()}
                    </td>
                  </tr>
                ))}
                {optionHoldings.length === 0 && <tr><td colSpan={9} className="py-8 text-center text-sm text-[var(--tv-text-secondary)]">暂无期权持仓</td></tr>}
              </tbody>
            </table>
          )}
        </div>

        {/* 录入表单 */}
        <div className="mb-6 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-[var(--tv-text-secondary)]">
              {editingUid ? "编辑交易" : tab === "STOCK" ? "新增股票交易" : "新增期权交易"}
            </h3>
            {editingUid && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--tv-text-secondary)]">修改自动保存</span>
                <button onClick={cancelEdit} className="text-xs text-[var(--tv-accent)] hover:underline">结束编辑</button>
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="mb-3 rounded border border-[var(--tv-red)]/30 bg-[var(--tv-red)]/10 px-3 py-2 text-sm text-[var(--tv-red)]">
              {errorMsg}
            </div>
          )}

          {tab === "STOCK" ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <input placeholder="股票名称" value={stockName} onChange={(e) => setStockName(e.target.value)} className="rounded px-3 py-2 text-sm" />
              <input placeholder="股票代码" value={stockId} onChange={(e) => setStockId(e.target.value)} className="rounded px-3 py-2 text-sm uppercase" />
              <input placeholder="数量（正买负卖）" value={number} onChange={(e) => setNumber(e.target.value)} type="number" className="rounded px-3 py-2 text-sm" />
              <input placeholder="成交价格" value={price} onChange={(e) => setPrice(e.target.value)} type="number" step="0.01" className="rounded px-3 py-2 text-sm" />
              <input placeholder="交易日期" value={tradeTime} onChange={(e) => setTradeTime(e.target.value)} type="date" className="rounded px-3 py-2 text-sm" />
              {!editingUid && (
                <button onClick={handleSubmitStock} className="rounded bg-[var(--tv-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-80">
                  添加记录
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <input placeholder="期权名称（如 NVDA 260619 130C）" value={optionName} onChange={(e) => setOptionName(e.target.value)} className="rounded px-3 py-2 text-sm" />
                <input placeholder="OCC 代码" value={optionId} onChange={(e) => setOptionId(e.target.value)} className="rounded px-3 py-2 text-sm uppercase" />
                <input placeholder="正股代码" value={optionUnderlying} onChange={(e) => setOptionUnderlying(e.target.value)} className="rounded px-3 py-2 text-sm uppercase" />
                <div className="flex gap-2">
                  <button onClick={() => setOptionType("CALL")} className={`flex-1 rounded px-3 py-2 text-sm font-medium ${optionType === "CALL" ? "bg-[var(--tv-green)] text-white" : "border border-[var(--tv-border)] text-[var(--tv-text-secondary)]"}`}>看涨 CALL</button>
                  <button onClick={() => setOptionType("PUT")} className={`flex-1 rounded px-3 py-2 text-sm font-medium ${optionType === "PUT" ? "bg-[var(--tv-red)] text-white" : "border border-[var(--tv-border)] text-[var(--tv-text-secondary)]"}`}>看跌 PUT</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <input placeholder="行权价" value={optionStrike} onChange={(e) => setOptionStrike(e.target.value)} type="number" step="0.01" className="rounded px-3 py-2 text-sm" />
                <input placeholder="到期日" value={optionExpiration} onChange={(e) => setOptionExpiration(e.target.value)} type="date" className="rounded px-3 py-2 text-sm" />
                <input placeholder="张数（正买负卖）" value={optionContracts} onChange={(e) => setOptionContracts(e.target.value)} type="number" className="rounded px-3 py-2 text-sm" />
                <input placeholder="权利金（每股）" value={optionPremium} onChange={(e) => setOptionPremium(e.target.value)} type="number" step="0.01" className="rounded px-3 py-2 text-sm" />
                {!editingUid && (
                  <button onClick={handleSubmitOption} className="rounded bg-[var(--tv-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-80">
                    添加记录
                  </button>
                )}
              </div>
              <div className="text-xs text-[var(--tv-text-secondary)]">
                美股期权 1 张 = 100 股，投入资金 = 张数 × 权利金 × 100
              </div>
            </div>
          )}
        </div>

        {/* 交易记录表 */}
        <div>
          <h3 className="mb-3 text-sm font-medium text-[var(--tv-text-secondary)]">
            交易记录<span className="ml-2 text-xs font-normal">({tradeRecords.length} 条)</span>
          </h3>
          <table className="w-full">
            <thead>
              <tr className="text-xs text-[var(--tv-text-secondary)]">
                <th className="py-3 text-left">名称</th><th className="py-3 text-right">代码</th><th className="py-3 text-right">类型</th><th className="py-3 text-right">数量/张数</th><th className="py-3 text-right">价格</th><th className="py-3 text-right">金额</th><th className="py-3 text-right">日期</th><th className="py-3"></th>
              </tr>
            </thead>
            <tbody>
              {paginatedRecords.map((r) => (
                <tr key={r.uid} className={`text-sm ${editingUid === r.uid ? "bg-[var(--tv-accent)]/10" : ""}`}>
                  <td className="py-3">{r.name}</td>
                  <td className="py-3 text-right text-[var(--tv-text-secondary)]">{r.id}</td>
                  <td className="py-3 text-right">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-xs ${r.assetType === "OPTION" ? "bg-purple-500/20 text-purple-400" : "bg-blue-500/20 text-blue-400"}`}>
                      {r.assetType === "OPTION" ? "期权" : "股票"}
                    </span>
                  </td>
                  <td className={`py-3 text-right ${r.number >= 0 ? "text-[var(--tv-green)]" : "text-[var(--tv-red)]"}`}>
                    {r.number >= 0 ? "+" : ""}{r.number}
                  </td>
                  <td className="py-3 text-right">${r.price.toFixed(2)}</td>
                  <td className="py-3 text-right">${r.cost.toLocaleString()}</td>
                  <td className="py-3 text-right text-[var(--tv-text-secondary)]">{formatTime(r.tradeTime)}</td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <button onClick={() => startEdit(r)} className="text-xs text-[var(--tv-accent)] hover:underline">编辑</button>
                      <button onClick={() => removeTradeRecord(r.uid)} className="text-xs text-[var(--tv-red)] hover:underline">删除</button>
                    </div>
                  </td>
                </tr>
              ))}
              {tradeRecords.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-sm text-[var(--tv-text-secondary)]">暂无交易记录</td></tr>}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-end gap-2 text-sm">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded px-3 py-1 text-[var(--tv-text-secondary)] hover:text-[var(--tv-text)] disabled:opacity-30">上一页</button>
              <span className="text-[var(--tv-text-secondary)]">{page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="rounded px-3 py-1 text-[var(--tv-text-secondary)] hover:text-[var(--tv-text)] disabled:opacity-30">下一页</button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
