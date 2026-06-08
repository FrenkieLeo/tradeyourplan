"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/lib/store";
import type { MegaCapResearch } from "@/types";

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function emptyResearch(id: string): MegaCapResearch {
  const now = Date.now();
  return {
    id,
    companyName: "",
    stockCode: "",
    coreTech: "",
    businessModel: "",
    managementCulture: "",
    mainBusiness: "",
    revenue: "",
    mainCustomers: "",
    advantages: "",
    disadvantages: "",
    summary: "",
    subSector: "",
    createdAt: now,
    updatedAt: now,
  };
}

const FIELDS: { key: keyof MegaCapResearch; label: string; multiline?: boolean }[] = [
  { key: "companyName", label: "公司名称" },
  { key: "stockCode", label: "股票代码" },
  { key: "coreTech", label: "核心技术", multiline: true },
  { key: "businessModel", label: "商业模式", multiline: true },
  { key: "managementCulture", label: "管理层及企业文化", multiline: true },
  { key: "mainBusiness", label: "主营业务", multiline: true },
  { key: "revenue", label: "营收情况", multiline: true },
  { key: "mainCustomers", label: "主要客户", multiline: true },
  { key: "advantages", label: "优势", multiline: true },
  { key: "disadvantages", label: "劣势", multiline: true },
  { key: "summary", label: "简要总结", multiline: true },
  { key: "subSector", label: "细分领域" },
];

const TABLE_COLUMNS: { key: keyof MegaCapResearch; label: string }[] = [
  { key: "companyName", label: "公司名称" },
  { key: "stockCode", label: "股票代码" },
  { key: "coreTech", label: "核心技术" },
  { key: "businessModel", label: "商业模式" },
  { key: "managementCulture", label: "管理层及企业文化" },
  { key: "mainBusiness", label: "主营业务" },
  { key: "revenue", label: "营收情况" },
  { key: "mainCustomers", label: "主要客户" },
  { key: "advantages", label: "优势" },
  { key: "disadvantages", label: "劣势" },
  { key: "summary", label: "简要总结" },
  { key: "subSector", label: "细分领域" },
];

function cellText(value: string) {
  if (!value) return "-";
  return value.length > 40 ? `${value.slice(0, 40)}…` : value;
}

export default function MegaCapResearchList() {
  const { megaCapResearches, addMegaCapResearch, updateMegaCapResearch, removeMegaCapResearch } = useStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MegaCapResearch | null>(null);
  const [showConfirm, setShowConfirm] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editingItem = draft ?? (editingId ? megaCapResearches.find((r) => r.id === editingId) ?? null : null);

  const persistDraft = useCallback(
    (id: string, updates: Partial<MegaCapResearch>) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        updateMegaCapResearch(id, updates);
      }, 400);
    },
    [updateMegaCapResearch]
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const openNew = () => {
    const id = newId();
    const item = emptyResearch(id);
    addMegaCapResearch(item);
    setEditingId(id);
    setDraft(item);
  };

  const openEdit = (item: MegaCapResearch) => {
    setEditingId(item.id);
    setDraft({ ...item });
  };

  const closeModal = () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (editingId && draft) {
      updateMegaCapResearch(editingId, draft);
    }
    setEditingId(null);
    setDraft(null);
  };

  const handleFieldChange = (key: keyof MegaCapResearch, value: string) => {
    if (!editingId || !draft) return;
    const next = {
      ...draft,
      [key]: key === "stockCode" ? value.toUpperCase() : value,
    };
    setDraft(next);
    persistDraft(editingId, { [key]: next[key] });
  };

  const handleDelete = (id: string) => {
    removeMegaCapResearch(id);
    setShowConfirm(null);
    if (editingId === id) {
      setEditingId(null);
      setDraft(null);
    }
  };

  const sorted = [...megaCapResearches].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">千亿市值公司研究清单</h2>
        <button
          onClick={openNew}
          className="rounded bg-[var(--tv-accent)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-80"
        >
          + 新增
        </button>
      </div>

      <div className="overflow-x-auto rounded border border-[var(--tv-border)]">
        <table className="min-w-[1400px]">
          <thead>
            <tr className="bg-[var(--tv-bg-secondary)]">
              {TABLE_COLUMNS.map((col) => (
                <th key={col.key} className="whitespace-nowrap px-3 py-3 text-left text-xs">
                  {col.label}
                </th>
              ))}
              <th className="sticky right-0 bg-[var(--tv-bg-secondary)] px-3 py-3 text-left text-xs">操作</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => (
              <tr key={item.id} className="border-t border-[var(--tv-border)] hover:bg-[var(--tv-bg-secondary)]">
                {TABLE_COLUMNS.map((col) => (
                  <td
                    key={col.key}
                    className="max-w-[180px] truncate px-3 py-3 text-sm text-[var(--tv-text-secondary)]"
                    title={String(item[col.key] ?? "")}
                  >
                    {cellText(String(item[col.key] ?? ""))}
                  </td>
                ))}
                <td className="sticky right-0 bg-[var(--tv-bg)] px-3 py-3 whitespace-nowrap">
                  {showConfirm === item.id ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-xs text-[var(--tv-red)] hover:underline"
                      >
                        确认删除
                      </button>
                      <button
                        onClick={() => setShowConfirm(null)}
                        className="text-xs text-[var(--tv-text-secondary)] hover:underline"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <button
                        onClick={() => openEdit(item)}
                        className="text-xs text-[var(--tv-accent)] hover:underline"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => setShowConfirm(item.id)}
                        className="text-xs text-[var(--tv-text-secondary)] hover:text-[var(--tv-red)] hover:underline"
                      >
                        删除
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={TABLE_COLUMNS.length + 1} className="py-8 text-center text-sm text-[var(--tv-text-secondary)]">
                  暂无研究记录，点击右上角「+ 新增」创建
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editingItem &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={closeModal}
          >
            <div
              className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[var(--tv-border)] bg-[var(--tv-bg)] p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-5 flex items-center justify-between">
                <h3 className="text-base font-semibold text-[var(--tv-text)]">编辑研究记录</h3>
                <button
                  onClick={closeModal}
                  className="text-xl leading-none text-[var(--tv-text-secondary)] hover:text-[var(--tv-text)]"
                >
                  &times;
                </button>
              </div>

              <p className="mb-4 text-xs text-[var(--tv-text-secondary)]">修改内容将自动保存，无需点击确认</p>

              <div className="space-y-4">
                {FIELDS.map((field) => (
                  <div key={field.key}>
                    <label className="mb-1 block text-xs text-[var(--tv-text-secondary)]">{field.label}</label>
                    {field.multiline ? (
                      <textarea
                        value={String(editingItem[field.key] ?? "")}
                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        className="min-h-[80px] w-full rounded border border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] px-3 py-2 text-sm text-[var(--tv-text)]"
                        rows={3}
                      />
                    ) : (
                      <input
                        value={String(editingItem[field.key] ?? "")}
                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        className={`w-full rounded border border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] px-3 py-2 text-sm text-[var(--tv-text)] ${field.key === "stockCode" ? "uppercase" : ""}`}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
