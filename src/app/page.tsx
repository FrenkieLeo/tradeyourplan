"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import TotalPortfolio from "@/components/TotalPortfolio";
import StockChart from "@/components/StockChart";
import OptionChart from "@/components/OptionChart";
import TradePlan from "@/components/TradePlan";
import TimelineSlider from "@/components/TimelineSlider";
import PriceUpdater from "@/components/PriceUpdater";
import DataBackup from "@/components/DataBackup";
import AllocationChart from "@/components/AllocationChart";
import BenchmarkChart from "@/components/BenchmarkChart";
import MegaCapResearchList from "@/components/MegaCapResearchList";
import FundamentalList from "@/components/FundamentalList";

type Viewport = "fundamental" | "portfolio" | "research";

export default function Home() {
  const { holdings, optionHoldings, loaded, isRefreshing } = useStore();
  const [viewport, setViewport] = useState<Viewport>("portfolio");

  const translateX =
    viewport === "fundamental" ? "translateX(0)"
    : viewport === "portfolio" ? "translateX(-33.333%)"
    : "translateX(-66.666%)";

  return (
    <div className="min-h-screen overflow-hidden bg-[var(--tv-bg)]">
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
            <div className="sticky top-0 z-40 border-b border-[#2962ff]/30 bg-[#2962ff]/10 backdrop-blur-sm">
              <div className="mx-auto flex max-w-5xl items-center justify-center gap-2 px-4 py-2 text-sm text-[#2962ff]">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                正在同步最新数据，请稍候...
              </div>
            </div>
          )}

          <div
            className="flex transition-transform duration-500 ease-in-out"
            style={{
              width: "300%",
              transform: translateX,
            }}
          >
            {/* 基本面跟踪视窗 */}
            <div className="w-1/3 shrink-0">
              <header className="sticky top-0 z-30 border-b border-[var(--tv-border)] bg-[var(--tv-bg)]/95 backdrop-blur-sm">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
                  <h1 className="text-lg font-bold text-[var(--tv-text)]">基本面跟踪清单</h1>
                  <DataBackup />
                </div>
              </header>

              <main className="mx-auto max-w-6xl px-4 py-6">
                <FundamentalList />
              </main>
            </div>

            {/* 投资组合视窗 */}
            <div className="w-1/3 shrink-0">
              <header className="sticky top-0 z-30 border-b border-[var(--tv-border)] bg-[var(--tv-bg)]/95 backdrop-blur-sm">
                <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
                  <h1 className="text-lg font-bold text-[var(--tv-text)]">TradeYourPlan</h1>
                  <DataBackup />
                </div>
              </header>

              <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
                <TimelineSlider />
                <TotalPortfolio />
                <BenchmarkChart />
                <AllocationChart />

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
            </div>

            {/* 研究清单视窗 */}
            <div className="w-1/3 shrink-0">
              <header className="sticky top-0 z-30 border-b border-[var(--tv-border)] bg-[var(--tv-bg)]/95 backdrop-blur-sm">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
                  <h1 className="text-lg font-bold text-[var(--tv-text)]">千亿市值公司研究清单</h1>
                  <DataBackup />
                </div>
              </header>

              <main className="mx-auto max-w-6xl px-4 py-6">
                <MegaCapResearchList />
              </main>
            </div>
          </div>

          {/* 视窗切换按钮 — 左侧 */}
          {viewport !== "fundamental" && (
            <button
              onClick={() => setViewport(viewport === "portfolio" ? "fundamental" : "portfolio")}
              className="fixed left-0 top-1/2 z-50 flex -translate-y-1/2 items-center gap-1 rounded-r-lg border border-l-0 border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] px-3 py-4 text-sm text-[var(--tv-text)] shadow-lg transition-colors hover:border-[var(--tv-accent)] hover:text-[var(--tv-accent)]"
              title={viewport === "portfolio" ? "前往基本面跟踪" : "返回投资组合"}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              <span className="text-xs [writing-mode:vertical-rl]">
                {viewport === "portfolio" ? "基本面" : "投资组合"}
              </span>
            </button>
          )}

          {/* 视窗切换按钮 — 右侧 */}
          {viewport !== "research" && (
            <button
              onClick={() => setViewport(viewport === "portfolio" ? "research" : "portfolio")}
              className="fixed right-0 top-1/2 z-50 flex -translate-y-1/2 items-center gap-1 rounded-l-lg border border-r-0 border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] px-3 py-4 text-sm text-[var(--tv-text)] shadow-lg transition-colors hover:border-[var(--tv-accent)] hover:text-[var(--tv-accent)]"
              title={viewport === "portfolio" ? "前往研究清单" : "返回投资组合"}
            >
              <span className="text-xs [writing-mode:vertical-rl]">
                {viewport === "portfolio" ? "研究清单" : "投资组合"}
              </span>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          )}
        </>
      )}
    </div>
  );
}
