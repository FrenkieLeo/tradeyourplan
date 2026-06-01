"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store";
import TotalPortfolio from "@/components/TotalPortfolio";
import StockChart from "@/components/StockChart";
import TradePlan from "@/components/TradePlan";
import TimelineSlider from "@/components/TimelineSlider";
import PriceUpdater from "@/components/PriceUpdater";

export default function Home() {
  const { stockHoldings, loaded, syncToJsonBin } = useStore();

  // 定期同步到 JSONBin
  useEffect(() => {
    if (!loaded) return;
    const interval = setInterval(() => {
      syncToJsonBin();
    }, 5 * 60 * 1000); // 每 5 分钟同步一次
    return () => clearInterval(interval);
  }, [loaded, syncToJsonBin]);

  // 关闭页面/刷新前同步
  useEffect(() => {
    if (!loaded) return;
    const handleBeforeUnload = () => {
      syncToJsonBin();
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
          <header className="sticky top-0 z-30 border-b border-[var(--tv-border)] bg-[var(--tv-bg)]/95 backdrop-blur-sm">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
              <h1 className="text-lg font-bold text-[var(--tv-text)]">TradeYourPlan</h1>
            </div>
          </header>

          <main className="mx-auto max-w-5xl px-4 py-6 space-y-6">
            <TimelineSlider />
            <TotalPortfolio />

            {stockHoldings.length > 0 && (
              <div>
                <h2 className="mb-4 text-base font-semibold">个股持仓收益</h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {stockHoldings.map((h) => (
                    <StockChart key={h.id} holding={h} />
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
