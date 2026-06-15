// Black-Scholes 欧式期权理论定价。
// 由于 Alpha Vantage 免费档不提供期权链，每天用 B-S 公式根据底层股票收盘价、
// 行权价、到期时间和常数波动率/无风险利率，估算一个"理论收盘权利金"。
// 这是估算值，与真实市场报价存在偏差（隐含波动率 σ 是常数假设）。

// 默认假设。这两个值后续可暴露给用户配置；目前先用常用值。
export const BS_DEFAULT_RISK_FREE = 0.04; // 4%
export const BS_DEFAULT_VOLATILITY = 0.3; // 30%

// 标准正态分布 CDF（Abramowitz & Stegun 26.2.17 近似），误差 < 7.5e-8。
function normCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return 0.5 * (1.0 + sign * y);
}

export interface BlackScholesInput {
  underlyingPrice: number;
  strikePrice: number;
  // 距到期年数 = (到期日 - 估值日) / 365。<= 0 时返回内在价值。
  timeToExpirationYears: number;
  type: "CALL" | "PUT";
  riskFreeRate?: number;
  volatility?: number;
}

// 返回估算的每股权利金。若输入非法（价格/行权价 <= 0），返回 0。
export function blackScholesPrice(input: BlackScholesInput): number {
  const { underlyingPrice: S, strikePrice: K, timeToExpirationYears: T, type } = input;
  const r = input.riskFreeRate ?? BS_DEFAULT_RISK_FREE;
  const sigma = input.volatility ?? BS_DEFAULT_VOLATILITY;

  if (!isFinite(S) || !isFinite(K) || S <= 0 || K <= 0) return 0;

  // 已过期：返回内在价值。
  if (T <= 0) {
    if (type === "CALL") return Math.max(0, S - K);
    return Math.max(0, K - S);
  }

  if (sigma <= 0) {
    if (type === "CALL") return Math.max(0, S - K * Math.exp(-r * T));
    return Math.max(0, K * Math.exp(-r * T) - S);
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  if (type === "CALL") {
    return S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
  }
  return K * Math.exp(-r * T) * normCdf(-d2) - S * normCdf(-d1);
}

// 把"YYYY-MM-DD"格式的到期日转换为相对 asOf 的剩余年数（按 365 天/年）。
// 输入解析失败时返回 0（即按已过期处理，给内在价值）。
export function yearsUntilExpiration(expirationDate: string, asOfDate: string): number {
  const exp = parseDate(expirationDate);
  const asOf = parseDate(asOfDate);
  if (!exp || !asOf) return 0;
  const ms = exp.getTime() - asOf.getTime();
  return ms / (365 * 24 * 60 * 60 * 1000);
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  // 兼容 "YYYY-MM-DD" 与 "YYYYMMDD"
  const norm = s.length === 8 && !s.includes("-")
    ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
    : s;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(norm);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}
