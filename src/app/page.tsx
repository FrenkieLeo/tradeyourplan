"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store";
import TotalPortfolio from "@/components/TotalPortfolio";
import StockChart from "@/components/StockChart";
import OptionChart from "@/components/OptionChart";
import TradePlan from "@/components/TradePlan";
import TimelineSlider from "@/components/TimelineSlider";
import PriceUpdater from "@/components/PriceUpdater";

export default function Home() {
  const { holdings, optionHoldings, loaded, syncToJsonBin, isRefreshing } = useStore();

  // 定期同步到 JSONBin
  useEffect(() => {
    if (!loaded) return;
    const interval = setInterval(() => {
      syncToJsonBin();
    }, 5 * 60 * 1000); // 每 5 分钟同步一次
    return () => clearInterval(interval);
  }, [loaded, syncToJsonBin]);

  // 关闭页面/刷新前同步（keepalive 确保请求在页面关闭后仍能完成）
  useEffect(() => {
    if (!loaded) return;
    const handleBeforeUnload = () => {
      syncToJsonBin(true);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [loaded, syncToJsonBin]);

  return (
    <div className="min-h-screen bg-[var(--tv-bg)]">
      <PriceUpdater />

      {!loaded ? (
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="mb-4 text-2xl font-bold text-[var(--tv-text)]">TradeYourPlan</div>
            <div className="text-sm text-[var(--tv-text-secondary)]">加载中...</div>
          </div>
        </div>
      ) : (
        <>
          {isRefreshing && (
            <div className="sticky top-0 z-40 bg-[#2962ff]/10 border-b border-[#2962ff]/30 backdrop-blur-sm">
              <div className="mx-auto flex max-w-5xl items-center justify-center gap-2 px-4 py-2 text-sm text-[#2962ff]">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                正在同步最新数据，请稍候...
              </div>
            </div>
          )}
          <header className="sticky top-0 z-30 border-b border-[var(--tv-border)] bg-[var(--tv-bg)]/95 backdrop-blur-sm">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
              <h1 className="text-lg font-bold text-[var(--tv-text)]">TradeYourPlan</h1>
            </div>
          </header>

          <main className="mx-auto max-w-5xl px-4 py-6 space-y-6">
            <TimelineSlider />
            <TotalPortfolio />

            {holdings.length > 0 && (
              <div>
                <h2 className="mb-4 text-base font-semibold">个股持仓收益</h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {holdings.map((h) => (
                    <StockChart key={h.id} holding={h} />
                  ))}
                </div>
              </div>
            )}

            {optionHoldings.length > 0 && (
              <div>
                <h2 className="mb-4 text-base font-semibold">期权持仓收益</h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {optionHoldings.map((o) => (
                    <OptionChart key={o.id} option={o} />
                  ))}
                </div>
              </div>
            )}

            <TradePlan />
          </main>
        </>
      )}
    </div>
  );
}
