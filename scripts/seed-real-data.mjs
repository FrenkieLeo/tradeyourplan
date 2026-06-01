import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env.local");

const envRaw = readFileSync(envPath, "utf-8");
const env = Object.fromEntries(
  envRaw
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      const val = l.slice(idx + 1).trim();
      return [l.slice(0, idx).trim(), val.replace(/\\\$/g, "$")];
    })
);

const BIN_ID = env["NEXT_PUBLIC_JSONBIN_BIN_ID"];
const API_KEY = env["NEXT_PUBLIC_JSONBIN_API_KEY"];

if (!BIN_ID || !API_KEY) {
  console.error("❌ 缺少 JSONBin 配置");
  process.exit(1);
}

// ─── 数据 ──────────────────────────────────────────────────

const tradeDate = 20260529;

const stocks = [
  { id: "NVDA",  name: "英伟达", number: 53,  price: 196.71, nowPrice: 211.14 },
  { id: "MSFT",  name: "微软",   number: 22,  price: 408.63, nowPrice: 450.24 },
  { id: "GOOG",  name: "谷歌",   number: 3,   price: 381.63, nowPrice: 372.08 },
  { id: "TSLA",  name: "特斯拉", number: 2,   price: 444.50, nowPrice: 435.79 },
];

function calcCost(p, n) { return parseFloat((p * n).toFixed(2)); }

const tradeRecords = stocks.map((s) => ({
  id: s.id,
  name: s.name,
  number: s.number,
  price: s.price,
  cost: calcCost(s.price, s.number),
  tradeTime: tradeDate,
}));

const cashAdj = tradeRecords.reduce((s, r) => s - r.cost, 0);
const baseCash = parseFloat((600 - cashAdj).toFixed(2));

const holdings = stocks.map((s) => {
  const cost = calcCost(s.price, s.number);
  const total = calcCost(s.nowPrice, s.number);
  const revenue = parseFloat((total - cost).toFixed(2));
  const revenuePercentage = cost > 0
    ? parseFloat(((revenue / cost) * 100).toFixed(2))
    : 0;
  return {
    id: s.id,
    name: s.name,
    number: s.number,
    price: s.price,
    cost,
    nowPrice: s.nowPrice,
    total,
    revenue,
    revenuePercentage,
  };
});

const data = {
  tradeRecords,
  tradePlans: [],
  journalEntries: [],
  snapshots: [],
  dailyReturns: [],
  baseCash,
  holdings,
  lastPriceUpdateDate: "2026-05-29",
};

console.log("=== 写入真实数据到 JSONBin ===\n");
console.log(`Bin ID: ${BIN_ID}\n`);

for (const h of holdings) {
  console.log(
    `  ${h.name}(${h.id}): ${h.number}股 | 成本$${h.price} | 现价$${h.nowPrice} | 市值$${h.total} | 收益$${h.revenue} (${h.revenuePercentage}%)`
  );
}
console.log(`  现金: $600`);
console.log(`  baseCash: $${baseCash}`);
console.log();

const res = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
  method: "PUT",
  headers: {
    "Content-Type": "application/json",
    "X-Master-Key": API_KEY,
  },
  body: JSON.stringify(data),
});

if (res.ok) {
  console.log("✅ 数据写入成功!");
  console.log(`🔗 https://jsonbin.io/${BIN_ID}`);
} else {
  console.log(`\n❌ 写入失败 (${res.status}): ${await res.text()}`);
  process.exit(1);
}
