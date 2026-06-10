"use client";

import { useState, useMemo } from "react";
import { useStore } from "@/lib/store";
import type { TradePlan as TradePlanType, TradePlanStatus } from "@/types";

const STATUS_CONFIG: Record<TradePlanStatus, { label: string; color: string; bg: string }> = {
  pending: { label: "待执行", color: "text-[var(--tv-yellow)]", bg: "bg-[var(--tv-yellow)]/15 border-[var(--tv-yellow)]/30" },
  executed: { label: "已执行", color: "text-[var(--tv-green)]", bg: "bg-[var(--tv-green)]/15 border-[var(--tv-green)]/30" },
  cancelled: { label: "已取消", color: "text-[var(--tv-text-secondary)]", bg: "bg-[var(--tv-bg-secondary)] border-[var(--tv-border)]" },
};

function getPlanStatus(plan: TradePlanType): TradePlanStatus {
  if (plan.status) return plan.status;
  return plan.cancelled ? "cancelled" : "pending";
}

export default function TradePlan() {
  const { tradePlans, tradeRecords, addTradePlan, updateTradePlan, removeTradePlan } = useStore();
  const [editingPlan, setEditingPlan] = useState<TradePlanType | null>(null);
  const [showConfirm, setShowConfirm] = useState<string | null>(null);
  const [filter, setFilter] = useState<TradePlanStatus | "all">("all");

  const executionMap = useMemo(() => {
    const map: Record<string, { avgPrice: number; totalQty: number; inRange: boolean }> = {};
    for (const plan of tradePlans) {
      if (!plan.stockCode) continue;
      const trades = tradeRecords.filter(
        (r) => r.id === plan.stockCode && r.number > 0 && r.tradeTime >= (plan.createdAt ? parseInt(new Date(plan.createdAt).toLocaleDateString("en-CA").replace(/-/g, ""), 10) : 0)
      );
      if (trades.length === 0) continue;
      const totalQty = trades.reduce((s, t) => s + t.number, 0);
      const totalCost = trades.reduce((s, t) => s + t.cost, 0);
      const avgPrice = totalQty > 0 ? totalCost / totalQty : 0;
      const inRange = avgPrice >= plan.expectedPriceMin && avgPrice <= plan.expectedPriceMax;
      map[plan.id] = { avgPrice, totalQty, inRange };
    }
    return map;
  }, [tradePlans, tradeRecords]);

  const openNew = () => {
    setEditingPlan({
      id: "",
      stockName: "",
      stockCode: "",
      expectedPriceMin: 0,
      expectedPriceMax: 0,
      riskRewardWin: 0,
      riskRewardLose: 1,
      winRate: 0,
      reason: "",
      createdAt: 0,
      updatedAt: 0,
      cancelled: false,
      status: "pending",
    });
  };

  const openEdit = (plan: TradePlanType) => {
    setEditingPlan({ ...plan });
  };

  const closeModal = () => {
    setEditingPlan(null);
  };

  const handleStatusChange = (status: TradePlanStatus) => {
    if (!editingPlan || !editingPlan.id) return;
    updateTradePlan(editingPlan.id, { status, cancelled: status === "cancelled" });
    closeModal();
  };

  const filteredPlans = useMemo(() => {
    const sorted = [...tradePlans].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
    if (filter === "all") return sorted;
    return sorted.filter((p) => getPlanStatus(p) === filter);
  }, [tradePlans, filter]);

  const formatTime = (t: number) => {
    const d = new Date(t);
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mo}-${day}`;
  };

  const handleSave = () => {
    if (!editingPlan) return;
    if (!editingPlan.id) {
      const plan: TradePlanType = {
        ...editingPlan,
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        createdAt: Date.now(),
      };
      addTradePlan(plan);
    } else {
      updateTradePlan(editingPlan.id, editingPlan);
    }
    closeModal();
  };

  const handleDelete = (id: string) => {
    removeTradePlan(id);
    setShowConfirm(null);
  };

  const statusCounts = useMemo(() => {
    const counts = { pending: 0, executed: 0, cancelled: 0 };
    for (const p of tradePlans) counts[getPlanStatus(p)]++;
    return counts;
  }, [tradePlans]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">交易计划</h2>
        <button
          onClick={openNew}
          className="rounded bg-[var(--tv-accent)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-80"
        >
          + 新增
        </button>
      </div>

      <div className="mb-3 flex gap-2">
        {([["all", "全部", tradePlans.length], ["pending", "待执行", statusCounts.pending], ["executed", "已执行", statusCounts.executed], ["cancelled", "已取消", statusCounts.cancelled]] as const).map(
          ([key, label, count]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                filter === key
                  ? "bg-[var(--tv-accent)]/15 text-[var(--tv-accent)] border border-[var(--tv-accent)]/30"
                  : "border border-[var(--tv-border)] text-[var(--tv-text-secondary)] hover:text-[var(--tv-text)]"
              }`}
            >
              {label} ({count})
            </button>
          )
        )}
      </div>

      <div className="overflow-x-auto rounded border border-[var(--tv-border)]">
        <table className="min-w-[800px]">
          <thead>
            <tr className="bg-[var(--tv-bg-secondary)]">
              <th className="px-3 py-3">状态</th>
              <th className="px-3 py-3">股票名称</th>
              <th className="px-3 py-3">股票代码</th>
              <th className="px-3 py-3">预计价格</th>
              <th className="px-3 py-3">实际买入</th>
              <th className="px-3 py-3">盈亏比</th>
              <th className="px-3 py-3">胜率预估</th>
              <th className="px-3 py-3">交易原因</th>
              <th className="px-3 py-3">更新时间</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filteredPlans.map((plan) => {
              const status = getPlanStatus(plan);
              const cfg = STATUS_CONFIG[status];
              const exec = executionMap[plan.id];
              const isCancelled = status === "cancelled";

              return (
                <tr
                  key={plan.id}
                  className={`group cursor-pointer transition-colors hover:bg-[var(--tv-bg-secondary)] ${isCancelled ? "opacity-50" : ""}`}
                  onClick={() => openEdit(plan)}
                >
                  <td className="px-3 py-3">
                    <span className={`inline-block rounded border px-2 py-0.5 text-[10px] font-medium ${cfg.bg} ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  </td>
                  <td className={`px-3 py-3 text-sm ${isCancelled ? "line-through" : ""}`}>{plan.stockName || "-"}</td>
                  <td className={`px-3 py-3 text-sm text-[var(--tv-text-secondary)] ${isCancelled ? "line-through" : ""}`}>{plan.stockCode || "-"}</td>
                  <td className={`px-3 py-3 text-sm ${isCancelled ? "line-through" : ""}`}>
                    {plan.expectedPriceMin || plan.expectedPriceMax
                      ? `$${plan.expectedPriceMin.toFixed(2)} ~ $${plan.expectedPriceMax.toFixed(2)}`
                      : "-"}
                  </td>
                  <td className="px-3 py-3 text-sm">
                    {exec ? (
                      <span className={exec.inRange ? "text-[var(--tv-green)]" : "text-[var(--tv-yellow)]"}>
                        ${exec.avgPrice.toFixed(2)} ({exec.totalQty}股)
                        {exec.inRange ? " ✓" : " ✗"}
                      </span>
                    ) : (
                      <span className="text-[var(--tv-text-secondary)]">-</span>
                    )}
                  </td>
                  <td className={`px-3 py-3 text-sm ${isCancelled ? "line-through" : ""}`}>{plan.riskRewardWin || plan.riskRewardLose ? `${plan.riskRewardWin}:${plan.riskRewardLose}` : "-"}</td>
                  <td className={`px-3 py-3 text-sm ${isCancelled ? "line-through" : ""}`}>{plan.winRate ? `${plan.winRate}%` : "-"}</td>
                  <td className={`max-w-[200px] truncate px-3 py-3 text-sm ${isCancelled ? "line-through text-[var(--tv-text-secondary)]" : "text-[var(--tv-text-secondary)]"}`}>
                    {plan.reason || "-"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-[var(--tv-text-secondary)]">{formatTime(plan.updatedAt || plan.createdAt)}</td>
                  <td className="px-3 py-3">
                    {showConfirm === plan.id ? (
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(plan.id); }}
                          className="text-xs text-[var(--tv-red)] hover:underline"
                        >
                          确认删除
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowConfirm(null); }}
                          className="text-xs text-[var(--tv-text-secondary)] hover:underline"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowConfirm(plan.id); }}
                        className="text-xs text-[var(--tv-text-secondary)] hover:text-[var(--tv-red)] hover:underline opacity-0 group-hover:opacity-100"
                      >
                        删除
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredPlans.length === 0 && (
              <tr>
                <td colSpan={10} className="py-8 text-center text-sm text-[var(--tv-text-secondary)]">
                  {tradePlans.length === 0 ? "暂无交易计划，点击右上角「+ 新增」创建" : "该分类下暂无计划"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {editingPlan !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-lg border border-[var(--tv-border)] bg-[var(--tv-bg)] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-base font-semibold">
                {editingPlan.id ? "编辑交易计划" : "新增交易计划"}
              </h3>
              <button
                onClick={closeModal}
                className="text-xl leading-none text-[var(--tv-text-secondary)] hover:text-[var(--tv-text)]"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">股票名称</label>
                  <input
                    value={editingPlan.stockName}
                    onChange={(e) => setEditingPlan({ ...editingPlan, stockName: e.target.value })}
                    className="w-full rounded px-3 py-2 text-sm"
                    placeholder="名称"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">股票代码</label>
                  <input
                    value={editingPlan.stockCode}
                    onChange={(e) => setEditingPlan({ ...editingPlan, stockCode: e.target.value.toUpperCase() })}
                    className="w-full rounded px-3 py-2 text-sm uppercase"
                    placeholder="代码"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">预计价格区间</label>
                  <div className="flex items-center gap-1">
                    <input
                      value={editingPlan.expectedPriceMin || ""}
                      onChange={(e) => setEditingPlan({ ...editingPlan, expectedPriceMin: parseFloat(e.target.value) || 0 })}
                      className="w-full rounded px-3 py-2 text-sm"
                      type="number"
                      step="0.01"
                      placeholder="最低价"
                    />
                    <span className="text-sm text-[var(--tv-text-secondary)]">~</span>
                    <input
                      value={editingPlan.expectedPriceMax || ""}
                      onChange={(e) => setEditingPlan({ ...editingPlan, expectedPriceMax: parseFloat(e.target.value) || 0 })}
                      className="w-full rounded px-3 py-2 text-sm"
                      type="number"
                      step="0.01"
                      placeholder="最高价"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">盈亏比</label>
                  <div className="flex items-center gap-1">
                    <input
                      value={editingPlan.riskRewardWin || ""}
                      onChange={(e) => setEditingPlan({ ...editingPlan, riskRewardWin: parseFloat(e.target.value) || 0 })}
                      className="w-full rounded px-3 py-2 text-sm"
                      type="number"
                      step="0.1"
                      placeholder="盈"
                    />
                    <span className="text-sm text-[var(--tv-text-secondary)]">:</span>
                    <input
                      value={editingPlan.riskRewardLose || ""}
                      onChange={(e) => setEditingPlan({ ...editingPlan, riskRewardLose: parseFloat(e.target.value) || 0 })}
                      className="w-full rounded px-3 py-2 text-sm"
                      type="number"
                      step="0.1"
                      placeholder="亏"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">胜率预估</label>
                  <input
                    value={editingPlan.winRate || ""}
                    onChange={(e) => setEditingPlan({ ...editingPlan, winRate: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded px-3 py-2 text-sm"
                    type="number"
                    step="1"
                    placeholder="0%"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">交易原因</label>
                <textarea
                  value={editingPlan.reason}
                  onChange={(e) => setEditingPlan({ ...editingPlan, reason: e.target.value })}
                  className="min-h-[120px] w-full rounded px-3 py-2 text-sm"
                  placeholder="详细描述交易原因..."
                  rows={5}
                />
              </div>

              {editingPlan.id && executionMap[editingPlan.id] && (
                <div className="rounded border border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] p-3">
                  <div className="text-xs text-[var(--tv-text-secondary)] mb-1">执行情况</div>
                  <div className="flex gap-4 text-sm">
                    <span>实际均价: <span className="font-medium">${executionMap[editingPlan.id].avgPrice.toFixed(2)}</span></span>
                    <span>买入数量: <span className="font-medium">{executionMap[editingPlan.id].totalQty}股</span></span>
                    <span className={executionMap[editingPlan.id].inRange ? "text-[var(--tv-green)]" : "text-[var(--tv-yellow)]"}>
                      {executionMap[editingPlan.id].inRange ? "在目标区间内" : "偏离目标区间"}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-between gap-3">
              {editingPlan.id ? (
                <div className="flex gap-2">
                  {(["pending", "executed", "cancelled"] as TradePlanStatus[]).map((s) => {
                    const cfg = STATUS_CONFIG[s];
                    const current = getPlanStatus(editingPlan);
                    if (s === current) return null;
                    return (
                      <button
                        key={s}
                        onClick={() => handleStatusChange(s)}
                        className={`rounded border px-3 py-2 text-sm ${cfg.bg} ${cfg.color} hover:opacity-80`}
                      >
                        {s === "pending" ? "恢复待执行" : s === "executed" ? "标记已执行" : "取消计划"}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div />
              )}
              <div className="flex gap-3">
                <button
                  onClick={closeModal}
                  className="rounded border border-[var(--tv-border)] px-4 py-2 text-sm text-[var(--tv-text-secondary)] hover:text-[var(--tv-text)]"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  className="rounded bg-[var(--tv-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-80"
                >
                  {editingPlan.id ? "保存修改" : "添加计划"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
