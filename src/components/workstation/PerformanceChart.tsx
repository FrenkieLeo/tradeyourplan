"use client";

import type { PortfolioPerformancePoint } from "@/types/workstation";

export default function PerformanceChart({ points }: { points: PortfolioPerformancePoint[] }) {
  if (points.length < 2) {
    return <div className="chart-empty"><span>等待历史数据</span><small>导入 IBKR Flex Query 后生成 TWR 收益率曲线</small></div>;
  }
  const values = points.map((point) => point.cumulativeReturn * 100);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 0.5);
  const coords = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 100;
    const y = 88 - ((value - min) / range) * 72;
    return `${x},${y}`;
  }).join(" ");
  const latest = values.at(-1) ?? 0;
  return (
    <div className="performance-chart">
      <div className="chart-head"><div><p className="eyebrow">TIME-WEIGHTED RETURN</p><strong className={latest >= 0 ? "positive" : "negative"}>{latest >= 0 ? "+" : ""}{latest.toFixed(2)}%</strong></div><span>账户初始至今</span></div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="时间加权收益率曲线">
        <defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#56d6b0" stopOpacity=".25"/><stop offset="1" stopColor="#56d6b0" stopOpacity="0"/></linearGradient></defs>
        <line x1="0" y1="88" x2="100" y2="88" stroke="#29313f" strokeWidth=".4"/>
        <polygon points={`0,92 ${coords} 100,92`} fill="url(#chartFill)" />
        <polyline points={coords} fill="none" stroke="#56d6b0" strokeWidth="1.3" vectorEffect="non-scaling-stroke"/>
      </svg>
      <div className="chart-axis"><span>{points[0].date}</span><span>{points.at(-1)?.date}</span></div>
    </div>
  );
}
