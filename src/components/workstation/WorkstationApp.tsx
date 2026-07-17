"use client";

import { useEffect, useMemo, useState } from "react";
import PriceUpdater from "@/components/PriceUpdater";
import TradePlan from "@/components/TradePlan";
import TradeReview from "@/components/TradeReview";
import FundamentalList from "@/components/FundamentalList";
import { useStore } from "@/lib/store";
import type { IbkrAccountSnapshot, IbkrPositionSnapshot, IntelligenceEvent, PortfolioPerformancePoint, WorkstationAlert } from "@/types/workstation";
import PerformanceChart from "./PerformanceChart";

type View = "overview" | "positions" | "intelligence" | "plan" | "review" | "research";
type ApiData = { configured: boolean; empty?: boolean; account?: { name: string; currency: string; lastSyncedAt: string | null }; snapshot?: IbkrAccountSnapshot | null; positions?: IbkrPositionSnapshot[]; performance?: PortfolioPerformancePoint[]; events?: IntelligenceEvent[]; alerts?: WorkstationAlert[] };

const money = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const preciseMoney = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const NAV: { id: View; label: string; icon: string }[] = [
  { id: "overview", label: "总览", icon: "⌁" }, { id: "positions", label: "持仓", icon: "▦" },
  { id: "intelligence", label: "公司情报", icon: "◈" }, { id: "plan", label: "交易计划", icon: "◇" },
  { id: "review", label: "交易复盘", icon: "↗" }, { id: "research", label: "研究库", icon: "◎" },
];

export default function WorkstationApp({ mode }: { mode: "supabase" | "legacy" }) {
  const store = useStore();
  const [view, setView] = useState<View>("overview");
  const [remote, setRemote] = useState<ApiData | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(mode === "supabase");

  useEffect(() => {
    if (mode !== "supabase") return;
    fetch("/api/workstation", { cache: "no-store" }).then((response) => response.json()).then(setRemote).finally(() => setRemoteLoading(false));
  }, [mode]);

  const localPositions = useMemo<IbkrPositionSnapshot[]>(() => [
    ...store.holdings.map((item) => ({ contractId: 0, symbol: item.id, description: item.name, securityType: "STK" as const, currency: "USD", quantity: item.number, averageCost: item.cost, marketPrice: item.nowPrice, marketValue: item.total, unrealizedPnl: item.revenue, dailyPnl: 0, marketDataAsOf: store.snapshots.at(-1)?.date ?? "" })),
    ...store.optionHoldings.map((item) => ({ contractId: 0, symbol: item.underlyingSymbol, description: item.name, securityType: "OPT" as const, currency: "USD", quantity: item.contracts, averageCost: item.averagePremium, marketPrice: item.nowPremium, marketValue: item.currentValue, unrealizedPnl: item.revenue, dailyPnl: 0, marketDataAsOf: store.snapshots.at(-1)?.date ?? "" })),
  ], [store.holdings, store.optionHoldings, store.snapshots]);

  const localPerformance = useMemo<PortfolioPerformancePoint[]>(() => store.snapshots.map((item) => {
    const nav = item.cash.total + item.holdings.reduce((sum, holding) => sum + holding.total, 0) + item.optionHoldings.reduce((sum, option) => sum + option.currentValue, 0);
    const base = store.snapshots[0] ? store.snapshots[0].cash.total + store.snapshots[0].holdings.reduce((sum, holding) => sum + holding.total, 0) + store.snapshots[0].optionHoldings.reduce((sum, option) => sum + option.currentValue, 0) : nav;
    return { date: item.date, nav, cash: item.cash.total, marketValue: nav - item.cash.total, netExternalFlow: 0, dailyReturn: item.dailyReturn, cumulativeReturn: base ? nav / base - 1 : 0, realizedPnl: 0, unrealizedPnl: 0 };
  }), [store.snapshots]);

  const positions = remote?.positions ?? localPositions;
  const performance = remote?.performance ?? localPerformance;
  const nav = remote?.snapshot?.netLiquidation ?? positions.reduce((sum, item) => sum + item.marketValue, 0) + store.cash.total;
  const available = remote?.snapshot?.availableFunds ?? store.cash.total;
  const dayPnl = positions.reduce((sum, item) => sum + item.dailyPnl, 0);
  const unrealized = positions.reduce((sum, item) => sum + item.unrealizedPnl, 0);
  const events = remote?.events ?? [];
  const accountName = remote?.account?.name ?? "IBKR 主账户";
  const lastSync = remote?.account?.lastSyncedAt ? new Date(remote.account.lastSyncedAt).toLocaleString("zh-CN") : "尚未完成 IBKR 同步";
  const stale = positions.some((item) => item.marketDataDelayed);
  const generatedAlerts: WorkstationAlert[] = remote?.alerts ?? (positions.length ? positions.filter((item) => nav > 0 && Math.abs(item.marketValue / nav) > .25).map((item) => ({ id: item.symbol, symbol: item.symbol, severity: "HIGH", title: `${item.symbol} 集中度偏高`, detail: `当前占净资产 ${Math.abs(item.marketValue / nav * 100).toFixed(1)}%，请核对单一标的风险预算。`, createdAt: item.marketDataAsOf, read: false })) : []);

  return (
    <div className="workstation">
      {mode === "legacy" && <PriceUpdater />}
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">T</div><div><strong>TradeYourPlan</strong><small>PRIVATE INVESTMENT OS</small></div></div>
        <nav>{NAV.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><span>{item.icon}</span>{item.label}{item.id === "intelligence" && generatedAlerts.length > 0 && <em>{generatedAlerts.length}</em>}</button>)}</nav>
        <div className="sidebar-foot"><span className="status-dot"/><div><strong>{accountName}</strong><small>{mode === "supabase" ? "Supabase · RLS 已启用" : "本地兼容模式"}</small></div></div>
      </aside>

      <main className="workspace">
        <header className="topbar"><div><p className="eyebrow">PORTFOLIO COMMAND CENTER</p><h1>{NAV.find((item) => item.id === view)?.label}</h1></div><div className="sync-state"><span className={stale ? "status-dot warning" : "status-dot"}/><div><strong>{remoteLoading || (mode === "legacy" && !store.loaded) ? "读取中…" : "IBKR 数据源"}</strong><small>{lastSync}</small></div></div></header>
        {view === "overview" && <>
          <section className="metric-grid">
            <Metric label="净资产" value={money.format(nav)} note="Net liquidation value" />
            <Metric label="今日盈亏" value={`${dayPnl >= 0 ? "+" : ""}${preciseMoney.format(dayPnl)}`} tone={dayPnl >= 0 ? "positive" : "negative"} note="IBKR Daily P&L" />
            <Metric label="未实现盈亏" value={`${unrealized >= 0 ? "+" : ""}${money.format(unrealized)}`} tone={unrealized >= 0 ? "positive" : "negative"} note="Moving average cost" />
            <Metric label="可用资金" value={money.format(available)} note={remote?.snapshot ? `购买力 ${money.format(remote.snapshot.buyingPower)}` : "等待账户摘要"} />
          </section>
          <section className="dashboard-grid">
            <div className="main-column"><div className="panel"><PerformanceChart points={performance}/></div><PositionsTable positions={positions} nav={nav}/></div>
            <aside className="right-rail"><AlertPanel alerts={generatedAlerts}/><EventPanel events={events}/><div className="panel schedule-card"><p className="eyebrow">OFFICIAL SOURCES</p><h3>每 12 小时检查</h3><p>公司官网、投资者关系、SEC/EDGAR 与基金发行方。财报提炼指标；其余重大内容翻译为中文。</p></div></aside>
          </section>
        </>}
        {view === "positions" && <PositionsTable positions={positions} nav={nav} expanded />}
        {view === "intelligence" && <div className="content-stack"><EventPanel events={events} expanded/><AlertPanel alerts={generatedAlerts}/></div>}
        {view === "plan" && <div className="legacy-panel"><TradePlan /></div>}
        {view === "review" && <div className="legacy-panel"><TradeReview /></div>}
        {view === "research" && <div className="legacy-panel"><FundamentalList /></div>}
      </main>
    </div>
  );
}

function Metric({ label, value, note, tone = "" }: { label: string; value: string; note: string; tone?: string }) { return <article className="metric"><span>{label}</span><strong className={tone}>{value}</strong><small>{note}</small></article>; }

function PositionsTable({ positions, nav, expanded = false }: { positions: IbkrPositionSnapshot[]; nav: number; expanded?: boolean }) {
  return <section className={`panel positions-panel ${expanded ? "expanded" : ""}`}><div className="panel-title"><div><p className="eyebrow">LIVE POSITIONS</p><h2>当前持仓</h2></div><span>{positions.length} 项 · IBKR 报价</span></div>{positions.length === 0 ? <Empty title="等待 IBKR 持仓" detail="完成首次同步后，股票、期权、现金和成本会出现在这里。"/> : <div className="table-scroll"><table><thead><tr><th>标的</th><th>类型</th><th>数量</th><th>现价</th><th>市值</th><th>未实现盈亏</th><th>仓位</th></tr></thead><tbody>{positions.map((item) => <tr key={`${item.contractId}-${item.symbol}-${item.description}`}><td><strong>{item.symbol}</strong><small>{item.description}</small></td><td><span className="asset-pill">{item.securityType}</span></td><td>{item.quantity.toLocaleString()}</td><td>{preciseMoney.format(item.marketPrice)}</td><td>{money.format(item.marketValue)}</td><td className={item.unrealizedPnl >= 0 ? "positive" : "negative"}>{item.unrealizedPnl >= 0 ? "+" : ""}{money.format(item.unrealizedPnl)}</td><td>{nav ? (Math.abs(item.marketValue / nav) * 100).toFixed(1) : "0.0"}%</td></tr>)}</tbody></table></div>}</section>;
}

function AlertPanel({ alerts }: { alerts: WorkstationAlert[] }) { return <section className="panel rail-panel"><div className="panel-title"><div><p className="eyebrow">RISK RADAR</p><h2>风险提醒</h2></div><span>{alerts.filter((item) => !item.read).length} 未读</span></div>{alerts.length === 0 ? <Empty title="暂无高风险事件" detail="集中度、保证金和重大公告会显示在这里。"/> : <div className="feed">{alerts.slice(0, 6).map((item) => <article key={item.id}><span className={`severity ${item.severity.toLowerCase()}`}>{item.severity}</span><div><strong>{item.title}</strong><p>{item.detail}</p></div></article>)}</div>}</section>; }

function EventPanel({ events, expanded = false }: { events: IntelligenceEvent[]; expanded?: boolean }) { return <section className={`panel rail-panel ${expanded ? "expanded" : ""}`}><div className="panel-title"><div><p className="eyebrow">COMPANY INTELLIGENCE</p><h2>官方动态</h2></div><span>12 小时轮询</span></div>{events.length === 0 ? <Empty title="等待首轮官方检查" detail="不会采集 X 或 YouTube；仅展示可追溯到官方来源的内容。"/> : <div className="feed">{events.slice(0, expanded ? 40 : 5).map((item) => <article key={item.id}><span className={`severity ${item.severity.toLowerCase()}`}>{item.symbol}</span><div><a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.titleZh}</a><p>{item.summaryZh}</p><small>{item.sourceName} · {new Date(item.publishedAt).toLocaleDateString("zh-CN")}</small></div></article>)}</div>}</section>; }

function Empty({ title, detail }: { title: string; detail: string }) { return <div className="empty-state"><span>◇</span><strong>{title}</strong><p>{detail}</p></div>; }
