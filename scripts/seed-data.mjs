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

// ─── 假数据 ──────────────────────────────────────────────────

const stocks = [
  { id: "600519", name: "贵州茅台" },
  { id: "000858", name: "五粮液" },
  { id: "600036", name: "招商银行" },
  { id: "601318", name: "中国平安" },
  { id: "300750", name: "宁德时代" },
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max, decimals = 2) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function daysAgo(n) {
  return Date.now() - n * 86400000;
}

// 生成一段时间内的多个交易日
function generateTradeDates(count, startDaysAgo = 90) {
  const dates = [];
  for (let i = 0; i < count; i++) {
    const offset = startDaysAgo - i * randomInt(1, 3); // 1-3天间隔模拟交易日
    dates.push(daysAgo(offset));
  }
  return dates;
}

// ─── 交易记录 ────────────────────────────────────────────────

const tradeRecords = [
  // 贵州茅台 - 多次买入
  { id: "600519", name: "贵州茅台", number: 200, price: 1680.00, cost: 336000, tradeTime: daysAgo(80) },
  { id: "600519", name: "贵州茅台", number: 100, price: 1720.50, cost: 172050, tradeTime: daysAgo(50) },
  { id: "600519", name: "贵州茅台", number: -100, price: 1850.00, cost: -185000, tradeTime: daysAgo(20) },
  // 五粮液
  { id: "000858", name: "五粮液", number: 500, price: 145.60, cost: 72800, tradeTime: daysAgo(70) },
  { id: "000858", name: "五粮液", number: 300, price: 152.30, cost: 45690, tradeTime: daysAgo(40) },
  // 招商银行
  { id: "600036", name: "招商银行", number: 1000, price: 32.50, cost: 32500, tradeTime: daysAgo(85) },
  { id: "600036", name: "招商银行", number: 500, price: 35.80, cost: 17900, tradeTime: daysAgo(30) },
  { id: "600036", name: "招商银行", number: -800, price: 38.20, cost: -30560, tradeTime: daysAgo(10) },
  // 中国平安
  { id: "601318", name: "中国平安", number: 800, price: 42.60, cost: 34080, tradeTime: daysAgo(60) },
  { id: "601318", name: "中国平安", number: 400, price: 45.20, cost: 18080, tradeTime: daysAgo(25) },
  // 宁德时代
  { id: "300750", name: "宁德时代", number: 200, price: 215.00, cost: 43000, tradeTime: daysAgo(45) },
  { id: "300750", name: "宁德时代", number: -50, price: 238.00, cost: -11900, tradeTime: daysAgo(5) },
];

// ─── 持仓 (从交易记录推算) ──────────────────────────────────

function calcHoldings(records) {
  const map = new Map();
  for (const r of records) {
    if (!map.has(r.id)) {
      const s = stocks.find((s) => s.id === r.id);
      map.set(r.id, { name: s?.name ?? "", totalNumber: 0, totalCost: 0 });
    }
    const e = map.get(r.id);
    if (r.number > 0) {
      const newNum = e.totalNumber + r.number;
      e.totalCost =
        newNum > 0
          ? (e.totalCost * e.totalNumber + r.price * r.number) / newNum
          : 0;
      e.totalNumber = newNum;
    } else {
      const sell = Math.abs(r.number);
      const remaining = Math.max(0, e.totalNumber - sell);
      if (remaining > 0 && e.totalNumber > 0) {
        e.totalCost =
          (e.totalCost * e.totalNumber - r.price * sell) / remaining;
      } else {
        e.totalCost = 0;
      }
      e.totalNumber = remaining;
    }
  }
  const currentPrices = {
    "600519": 1820.00,
    "000858": 148.50,
    "600036": 36.80,
    "601318": 44.50,
    "300750": 225.00,
  };
  const holdings = [];
  for (const [id, e] of map) {
    if (e.totalNumber <= 0) continue;
    const nowPrice = currentPrices[id] ?? e.totalCost;
    const cost = e.totalCost * e.totalNumber;
    const total = nowPrice * e.totalNumber;
    const revenue = total - cost;
    const revenuePercentage =
      cost > 0 ? parseFloat(((revenue / cost) * 100).toFixed(2)) : 0;
    holdings.push({
      id,
      name: e.name,
      number: e.totalNumber,
      price: parseFloat(e.totalCost.toFixed(2)),
      cost: parseFloat(cost.toFixed(2)),
      nowPrice,
      total: parseFloat(total.toFixed(2)),
      revenue: parseFloat(revenue.toFixed(2)),
      revenuePercentage,
    });
  }
  return holdings;
}

const holdings = calcHoldings(tradeRecords);

// ─── 现金 ─────────────────────────────────────────────────────

const baseCash = 600000;
const cashAdj = tradeRecords.reduce((s, r) => {
  return r.number > 0 ? s - r.cost : s + Math.abs(r.cost);
}, 0);

const cash = { id: "cash", name: "现金", total: parseFloat((baseCash + cashAdj).toFixed(2)) };

// ─── 交易计划 ────────────────────────────────────────────────

const tradePlans = [
  {
    id: "plan-001",
    stockName: "贵州茅台",
    stockCode: "600519",
    expectedPrice: 1750.00,
    riskRewardWin: 3.5,
    riskRewardLose: 1,
    winRate: 65,
    reason: "技术面回调至60日均线支撑位，MACD金叉信号",
    createdAt: daysAgo(15),
    updatedAt: daysAgo(15),
    cancelled: false,
  },
  {
    id: "plan-002",
    stockName: "宁德时代",
    stockCode: "300750",
    expectedPrice: 200.00,
    riskRewardWin: 2.8,
    riskRewardLose: 1,
    winRate: 60,
    reason: "新能源汽车政策利好，回调至前期平台支撑",
    createdAt: daysAgo(10),
    updatedAt: daysAgo(10),
    cancelled: false,
  },
  {
    id: "plan-003",
    stockName: "招商银行",
    stockCode: "600036",
    expectedPrice: 40.00,
    riskRewardWin: 4,
    riskRewardLose: 1,
    winRate: 70,
    reason: "银行板块估值修复，股息率超过5%",
    createdAt: daysAgo(7),
    updatedAt: daysAgo(7),
    cancelled: true,
  },
  {
    id: "plan-004",
    stockName: "五粮液",
    stockCode: "000858",
    expectedPrice: 155.00,
    riskRewardWin: 2.5,
    riskRewardLose: 1,
    winRate: 55,
    reason: "消费复苏预期，中秋国庆旺季备货",
    createdAt: daysAgo(3),
    updatedAt: daysAgo(3),
    cancelled: false,
  },
];

// ─── 交易日志 ────────────────────────────────────────────────

const journalEntries = [
  {
    id: "journal-001",
    name: "建仓茅台",
    time: daysAgo(80),
    content: "今日以1680元建仓贵州茅台200股。茅台批价稳定在2400元左右，库存充足，动销良好。技术面看日线级别回调充分，已到前期箱体上沿支撑位。",
  },
  {
    id: "journal-002",
    name: "建仓招商银行",
    time: daysAgo(85),
    content: "32.5买入招商银行1000股。银行股当前PB仅0.6倍，处于历史低位。招行不良率连续下降，零售银行业务优势明显。",
  },
  {
    id: "journal-003",
    name: "减仓茅台",
    time: daysAgo(20),
    content: "1850减仓100股茅台，获利了结部分仓位。短期涨幅较大，RSI进入超买区，先锁定部分利润。剩余仓位继续持有。",
  },
  {
    id: "journal-004",
    name: "市场分析",
    time: daysAgo(8),
    content: "本周市场整体震荡上行，成交量温和放大。北向资金连续5日净流入，累计约300亿。重点关注下周美联储议息会议对新兴市场的影响。",
  },
  {
    id: "journal-005",
    name: "建仓宁德时代",
    time: daysAgo(45),
    content: "215建仓宁德时代200股。公司麒麟电池量产在即，海外市场份额持续提升。Q3财报预期向好，营收增速预计30%+。",
  },
  {
    id: "journal-006",
    name: "仓位调整",
    time: daysAgo(5),
    content: "238减仓50股宁德时代。近期股价受大盘拖累有所回落，但基本面未变。小幅减仓等待更好的加仓机会。",
  },
];

// ─── 快照 (从交易记录生成) ──────────────────────────────────

function generateSnapshots(records, baseCashVal) {
  const tradeDates = records.map((r) => r.tradeTime).sort((a, b) => a - b);

  // Generate monthly snapshots
  const now = Date.now();
  const snapshots = [];
  const months = ["01", "02", "03", "04", "05", "06"];
  const priceProgression = {
    "600519": [1650, 1680, 1720, 1780, 1800, 1820],
    "000858": [140, 142, 145, 148, 150, 148],
    "600036": [31, 32, 34, 35, 37, 37],
    "601318": [41, 42, 43, 44, 44, 45],
    "300750": [205, 210, 215, 220, 230, 225],
  };

  for (let i = 0; i < months.length; i++) {
    const ts = new Date(`2026-${months[i]}-15`).getTime();
    const h = stocks
      .map((s) => {
        const r = records.filter((r) => r.id === s.id && r.tradeTime <= ts);
        const totalNum = r.reduce((sum, r) => sum + r.number, 0);
        if (totalNum <= 0) return null;
        const price = priceProgression[s.id]?.[i] ?? 0;
        const totalCost = r.reduce((sum, r) => sum + r.cost, 0);
        // simplified cost tracking
        const buyRecords = r.filter((r) => r.number > 0);
        const totalBuyNum = buyRecords.reduce((s, r) => s + r.number, 0);
        const totalBuyCost = buyRecords.reduce((s, r) => s + r.cost, 0);
        const avgCost = totalBuyNum > 0 ? totalBuyCost / totalBuyNum : price;
        const costTotal = avgCost * totalNum;
        const total = price * totalNum;
        return {
          id: s.id,
          name: s.name,
          number: totalNum,
          price: parseFloat(avgCost.toFixed(2)),
          cost: parseFloat(costTotal.toFixed(2)),
          nowPrice: price,
          total: parseFloat(total.toFixed(2)),
          revenue: parseFloat((total - costTotal).toFixed(2)),
          revenuePercentage:
            costTotal > 0
              ? parseFloat((((total - costTotal) / costTotal) * 100).toFixed(2))
              : 0,
        };
      })
      .filter(Boolean);

    const totalValue = h.reduce((s, h) => s + h.total, 0) + baseCashVal;
    const totalCost = h.reduce((s, h) => s + h.cost, 0);
    const totalRevenue = h.reduce((s, h) => s + h.revenue, 0);

    snapshots.push({
      timestamp: ts,
      date: `2026-${months[i]}-15`,
      holdings: h,
      cash: { id: "cash", name: "现金", total: parseFloat((baseCashVal + cashAdj * (i + 1) / months.length).toFixed(2)) },
      dailyReturn:
        totalCost > 0
          ? parseFloat(((totalRevenue / totalCost) * 100).toFixed(2))
          : 0,
    });
  }

  // Add final real-time snapshot
  const finalHoldings = calcHoldings(records);
  const finalTotal = finalHoldings.reduce((s, h) => s + h.total, 0);
  const finalCost = finalHoldings.reduce((s, h) => s + h.cost, 0);
  const finalRevenue = finalHoldings.reduce((s, h) => s + h.revenue, 0);
  snapshots.push({
    timestamp: now,
    date: new Date().toISOString().slice(0, 10),
    holdings: finalHoldings,
    cash,
    dailyReturn: finalCost > 0 ? parseFloat(((finalRevenue / finalCost) * 100).toFixed(2)) : 0,
  });

  return snapshots;
}

const snapshots = generateSnapshots(tradeRecords, baseCash);

// ─── Daily Returns ───────────────────────────────────────────

const dailyReturns = monthsToDaily("2026", [
  { month: "01", value: 5000 },
  { month: "02", value: 8200 },
  { month: "03", value: -1500 },
  { month: "04", value: 12000 },
  { month: "05", value: 6500 },
  { month: "06", value: 3800 },
]);

function monthsToDaily(year, monthData) {
  const result = [];
  for (const m of monthData) {
    const daysInMonth = new Date(Number(year), Number(m.month), 0).getDate();
    const perDay = m.value / daysInMonth;
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${year}-${m.month}-${String(d).padStart(2, "0")}`;
      result.push({ date, return: parseFloat((result.length > 0 ? perDay + result[result.length - 1].return : perDay).toFixed(2)) });
    }
  }
  return result;
}

// ─── 最终数据结构 ────────────────────────────────────────────

const seedData = {
  tradeRecords,
  tradePlans,
  journalEntries,
  snapshots,
  dailyReturns,
  baseCash,
};

// ─── 写入 JSONBin ────────────────────────────────────────────

async function seed() {
  const BIN_ID = env["NEXT_PUBLIC_JSONBIN_BIN_ID"];
  const API_KEY = env["NEXT_PUBLIC_JSONBIN_API_KEY"];

  if (!BIN_ID || !API_KEY) {
    console.error("❌ 缺少 JSONBin 配置");
    process.exit(1);
  }

  console.log("=== 写入假数据到 JSONBin ===\n");
  console.log(`Bin ID: ${BIN_ID}\n`);

  console.log("数据概要:");
  console.log(`  📊 交易记录: ${tradeRecords.length} 条`);
  console.log(`  📋 交易计划: ${tradePlans.length} 条`);
  console.log(`  📝 日志条目: ${journalEntries.length} 条`);
  console.log(`  📸 快照: ${snapshots.length} 条`);
  console.log(`  📈 日收益: ${dailyReturns.length} 条`);
  console.log(`  💰 初始现金: $${baseCash.toLocaleString()}`);
  console.log(`  💵 当前现金: $${cash.total.toLocaleString()}`);
  console.log(`  🏦 持仓数: ${holdings.length} 只\n`);

  for (const h of holdings) {
    console.log(
      `     ${h.name}(${h.id}): ${h.number}股 | 成本$${h.price} | 现价$${h.nowPrice} | 收益$${h.revenue} (${h.revenuePercentage}%)`
    );
  }

  const res = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Master-Key": API_KEY,
    },
    body: JSON.stringify(seedData),
  });

  if (res.ok) {
    console.log("\n✅ 假数据写入成功!");
    console.log(`🔗 https://jsonbin.io/${BIN_ID}`);
  } else {
    console.log(`\n❌ 写入失败 (${res.status}): ${await res.text()}`);
    process.exit(1);
  }
}

seed().catch(console.error);
