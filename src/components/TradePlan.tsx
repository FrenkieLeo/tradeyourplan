"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import type { TradePlan as TradePlanType } from "@/types";

export default function TradePlan() {
  const { tradePlans, addTradePlan, updateTradePlan, removeTradePlan } = useStore();
  const [editingPlan, setEditingPlan] = useState<TradePlanType | null>(null);
  const [showConfirm, setShowConfirm] = useState<string | null>(null);

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
    });
  };

  const openEdit = (plan: TradePlanType) => {
    setEditingPlan({ ...plan });
  };

  const closeModal = () => {
    setEditingPlan(null);
  };

  const handleCancelToggle = () => {
    if (!editingPlan || !editingPlan.id) return;
    updateTradePlan(editingPlan.id, { cancelled: !editingPlan.cancelled });
    closeModal();
  };

  const sortedPlans = [...tradePlans].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));

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

      <div className="overflow-x-auto rounded border border-[var(--tv-border)]">
        <table className="min-w-[700px]">
          <thead>
            <tr className="bg-[var(--tv-bg-secondary)]">
              <th className="px-3 py-3">股票名称</th>
              <th className="px-3 py-3">股票代码</th>
              <th className="px-3 py-3">预计价格</th>
              <th className="px-3 py-3">盈亏比</th>
              <th className="px-3 py-3">胜率预估</th>
              <th className="px-3 py-3">交易原因</th>
              <th className="px-3 py-3">更新时间</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {sortedPlans.map((plan) => (
              <tr
                key={plan.id}
                className={`cursor-pointer transition-colors hover:bg-[var(--tv-bg-secondary)] ${plan.cancelled ? "opacity-50" : ""}`}
                onClick={() => openEdit(plan)}
              >
                <td className={`px-3 py-3 text-sm ${plan.cancelled ? "line-through" : ""}`}>{plan.stockName || "-"}</td>
                <td className={`px-3 py-3 text-sm text-[var(--tv-text-secondary)] ${plan.cancelled ? "line-through" : ""}`}>{plan.stockCode || "-"}</td>
                <td className={`px-3 py-3 text-sm ${plan.cancelled ? "line-through" : ""}`}>
                  {plan.expectedPriceMin || plan.expectedPriceMax
                    ? `$${plan.expectedPriceMin.toFixed(2)} ~ $${plan.expectedPriceMax.toFixed(2)}`
                    : "-"}
                </td>
                <td className={`px-3 py-3 text-sm ${plan.cancelled ? "line-through" : ""}`}>{plan.riskRewardWin || plan.riskRewardLose ? `${plan.riskRewardWin}:${plan.riskRewardLose}` : "-"}</td>
                <td className={`px-3 py-3 text-sm ${plan.cancelled ? "line-through" : ""}`}>{plan.winRate ? `${plan.winRate}%` : "-"}</td>
                <td className={`max-w-[200px] truncate px-3 py-3 text-sm ${plan.cancelled ? "line-through text-[var(--tv-text-secondary)]" : "text-[var(--tv-text-secondary)]"}`}>
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
            ))}
            {tradePlans.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-sm text-[var(--tv-text-secondary)]">
                  暂无交易计划，点击右上角「+ 新增」创建
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
            className="w-full max-w-lg rounded-lg border border-[var(--tv-border)] bg-[var(--tv-bg)] p-6 shadow-2xl"
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
            </div>

            <div className="mt-6 flex justify-between gap-3">
              {editingPlan.id ? (
                <button
                  onClick={handleCancelToggle}
                  className="rounded border border-[var(--tv-red)] px-4 py-2 text-sm text-[var(--tv-red)] hover:bg-[var(--tv-red)]/10"
                >
                  {editingPlan.cancelled ? "恢复计划" : "取消计划"}
                </button>
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
