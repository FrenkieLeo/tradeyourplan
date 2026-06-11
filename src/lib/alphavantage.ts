// 行情通过同源服务端路由 /api/av 代理，密钥由服务端持有（见 src/app/api/av/route.ts）。

interface AlphaVantageQuote {
  "Global Quote": {
    "01. symbol": string;
    "02. open": string;
    "03. high": string;
    "04. low": string;
    "05. price": string;
    "06. volume": string;
    "07. latest trading day": string;
    "08. previous close": string;
    "09. change": string;
    "10. change percent": string;
  };
}

interface AlphaVantageTimeSeries {
  "Meta Data": {
    "2. Symbol": string;
  };
  "Weekly Time Series": Record<string, Record<string, string>>;
}

export interface StockQuote {
  symbol: string;
  price: number;
  latestTradingDay: string;
  previousClose: number;
  changePercent: number;
}

export interface WeeklyKline {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function fetchQuote(symbol: string): Promise<StockQuote | null> {
  try {
    const res = await fetch(
      `/api/av?fn=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (isAvRateLimited(data)) {
      console.warn("[fetchQuote] Alpha Vantage rate limited for", symbol);
      return null;
    }
    const quote = (data as AlphaVantageQuote)["Global Quote"];
    if (!quote || !quote["05. price"]) return null;

    return {
      symbol: quote["01. symbol"],
      price: parseFloat(quote["05. price"]),
      latestTradingDay: quote["07. latest trading day"],
      previousClose: parseFloat(quote["08. previous close"]),
      changePercent: parseFloat(quote["10. change percent"].replace("%", "")),
    };
  } catch {
    return null;
  }
}

export async function fetchWeeklyKlines(
  symbol: string
): Promise<WeeklyKline[]> {
  try {
    const res = await fetch(
      `/api/av?fn=TIME_SERIES_WEEKLY&symbol=${encodeURIComponent(symbol)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    const data: AlphaVantageTimeSeries = await res.json();
    const series = data["Weekly Time Series"];
    if (!series) return [];

    return Object.entries(series)
      .map(([date, values]) => ({
        date,
        open: parseFloat(values["1. open"]),
        high: parseFloat(values["2. high"]),
        low: parseFloat(values["3. low"]),
        close: parseFloat(values["4. close"]),
        volume: parseInt(values["5. volume"], 10),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

// 拉取日线收盘价（用于基准对比）。返回 { 'YYYY-MM-DD': close }。
export async function fetchDailyCloses(symbol: string): Promise<Record<string, number>> {
  try {
    const res = await fetch(
      `/api/av?fn=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return {};
    const data = await res.json();
    const series = data["Time Series (Daily)"];
    if (!series) return {};
    const out: Record<string, number> = {};
    for (const [date, v] of Object.entries(series)) {
      const close = parseFloat((v as Record<string, string>)["4. close"]);
      if (!isNaN(close)) out[date] = close;
    }
    return out;
  } catch {
    return {};
  }
}

const ET_TZ = "America/New_York";
const ET_WEEKDAY: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

// 用 formatToParts 取美东时间分量，避免 toLocaleString → new Date 在浏览器本地时区下解析错误。
function getETComponents(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const v = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: ET_TZ,
    weekday: "short",
  }).format(now);
  return {
    year: v("year"),
    month: v("month"),
    day: v("day"),
    hour: parseInt(v("hour"), 10),
    minute: parseInt(v("minute"), 10),
    dayOfWeek: ET_WEEKDAY[weekday.slice(0, 3)] ?? 0,
  };
}

export function getETDate(now = new Date()): string {
  const { year, month, day } = getETComponents(now);
  return `${year}-${month}-${day}`;
}

export function isAfterMarketClose(now = new Date()): boolean {
  const { dayOfWeek, hour, minute } = getETComponents(now);
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  return hour * 60 + minute >= 16 * 60;
}

export function isWeekend(now = new Date()): boolean {
  const { dayOfWeek } = getETComponents(now);
  return dayOfWeek === 0 || dayOfWeek === 6;
}

// 一个收盘价是否「已定型」：早于今日(美东)，或就是今日且已收盘。
// 用于过滤盘中实时价 / 未来日期，避免把未定型数据当成收盘价存入快照。
export function isFinalizedTradingDate(date: string): boolean {
  const todayET = getETDate();
  return date < todayET || (date === todayET && isAfterMarketClose());
}

// 最近一个「已收盘」的交易日（美东时间，YYYY-MM-DD）。
// 仅按周末做粗略推算（不含法定节假日），用于节流自动拉取，不参与日期标注——
// 真正的快照日期一律以 Alpha Vantage 返回的 "latest trading day" 为准。
export function lastCompletedTradingDayET(now = new Date()): string {
  const { year, month, day, dayOfWeek, hour, minute } = getETComponents(now);
  const closedToday =
    dayOfWeek !== 0 &&
    dayOfWeek !== 6 &&
    hour * 60 + minute >= 16 * 60;

  const cursor = new Date(Date.UTC(+year, +month - 1, +day));
  if (!closedToday) cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  const yy = cursor.getUTCFullYear();
  const mm = String(cursor.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(cursor.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function isAvRateLimited(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return typeof d.Note === "string" || typeof d.Information === "string";
}
