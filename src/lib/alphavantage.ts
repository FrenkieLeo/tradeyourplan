const BASE_URL = "https://www.alphavantage.co/query";
const API_KEY = "RJFNH4AQQR0KXNKT";

function getApiKey(): string {
  return API_KEY;
}

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
  const key = getApiKey();
  if (!key) return null;

  try {
    const res = await fetch(
      `${BASE_URL}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${key}`
    );
    if (!res.ok) return null;
    const data: AlphaVantageQuote = await res.json();
    const quote = data["Global Quote"];
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
  const key = getApiKey();
  if (!key) return [];

  try {
    const res = await fetch(
      `${BASE_URL}?function=TIME_SERIES_WEEKLY&symbol=${symbol}&apikey=${key}`
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

export function getETDate(): string {
  const now = new Date();
  return now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export function isAfterMarketClose(): boolean {
  const now = new Date();
  const et = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" })
  );
  const day = et.getDay();

  if (day === 0 || day === 6) return false;

  const totalMinutes = et.getHours() * 60 + et.getMinutes();
  return totalMinutes >= 16 * 60;
}

export function isWeekend(): boolean {
  const now = new Date();
  const et = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" })
  );
  const day = et.getDay();
  return day === 0 || day === 6;
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
export function lastCompletedTradingDayET(): string {
  const now = new Date();
  const et = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" })
  );
  const closedToday =
    et.getDay() !== 0 &&
    et.getDay() !== 6 &&
    et.getHours() * 60 + et.getMinutes() >= 16 * 60;

  const cursor = new Date(et.getFullYear(), et.getMonth(), et.getDate());
  if (!closedToday) cursor.setDate(cursor.getDate() - 1);
  while (cursor.getDay() === 0 || cursor.getDay() === 6) {
    cursor.setDate(cursor.getDate() - 1);
  }

  const yy = cursor.getFullYear();
  const mm = String(cursor.getMonth() + 1).padStart(2, "0");
  const dd = String(cursor.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
