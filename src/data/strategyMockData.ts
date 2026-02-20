export interface TradeLogEntry {
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  duration: string;
  date: string;
}

export interface MonthlyReturn {
  month: string;
  value: number;
}

export interface EquityPoint {
  time: string;
  value: number;
  benchmark: number;
}

export interface StrategyDetail {
  id: string;
  title: string;
  description: string;
  longDescription: string;
  author: {
    name: string;
    isSebiVerified: boolean;
    avatar: string;
  };
  sharpeRatio: number;
  cagr: number;
  riskScore: "low" | "medium" | "high";
  subscribers: number;
  winRate: number;
  minCapital: number;
  price: number | null; // null = free
  maxDrawdown: number;
  profitFactor: number;
  avgRiskReward: string;
  totalTrades: number;
  tradeLog: TradeLogEntry[];
  monthlyReturns: MonthlyReturn[];
  equityCurve: EquityPoint[];
}

function generateEquityCurve(
  startValue: number,
  months: number,
  avgMonthlyReturn: number,
  volatility: number
): EquityPoint[] {
  const points: EquityPoint[] = [];
  let value = startValue;
  let benchmark = startValue;
  const startDate = new Date(2024, 0, 1);

  for (let d = 0; d < months * 22; d++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + d);
    if (date.getDay() === 0 || date.getDay() === 6) continue;

    const dailyReturn = avgMonthlyReturn / 22 + (Math.random() - 0.42) * volatility;
    const benchmarkReturn = 0.12 / 252 + (Math.random() - 0.48) * 0.012;
    value *= 1 + dailyReturn;
    benchmark *= 1 + benchmarkReturn;

    points.push({
      time: date.toISOString().split("T")[0],
      value: Math.round(value),
      benchmark: Math.round(benchmark),
    });
  }
  return points;
}

export const strategies: StrategyDetail[] = [
  {
    id: "1",
    title: "Momentum RSI Crossover",
    description:
      "Long-only momentum strategy using RSI divergence with price action confirmation on Nifty 50 stocks.",
    longDescription:
      "This algorithm operates on a 15-minute timeframe to detect RSI divergences coupled with MACD crossovers on Nifty 50 constituent stocks. It enters long positions when the RSI crosses above 40 from oversold territory while the MACD histogram turns positive, confirmed by a bullish engulfing candle pattern. Position sizing is dynamically adjusted based on ATR-normalized volatility, with a maximum of 3 concurrent positions. Stop-loss is set at 1.5x ATR below the entry price, and trailing stops activate at 2% profit to lock in gains.",
    author: { name: "Rajesh Sharma", isSebiVerified: true, avatar: "RS" },
    sharpeRatio: 1.92,
    cagr: 28.4,
    riskScore: "medium",
    subscribers: 1,
    winRate: 68.4,
    minCapital: 50000,
    price: 999,
    maxDrawdown: -8.4,
    profitFactor: 1.82,
    avgRiskReward: "1:2.1",
    totalTrades: 342,
    tradeLog: [
      { symbol: "RELIANCE", entryPrice: 2845.5, exitPrice: 2912.3, pnl: 6690, duration: "2d 4h", date: "2024-11-18" },
      { symbol: "TCS", entryPrice: 3920.0, exitPrice: 3878.5, pnl: -4150, duration: "1d 2h", date: "2024-11-15" },
      { symbol: "HDFCBANK", entryPrice: 1678.25, exitPrice: 1724.8, pnl: 4655, duration: "3d 6h", date: "2024-11-12" },
      { symbol: "INFY", entryPrice: 1845.0, exitPrice: 1892.4, pnl: 4740, duration: "1d 7h", date: "2024-11-08" },
      { symbol: "ICICIBANK", entryPrice: 1245.6, exitPrice: 1268.9, pnl: 2330, duration: "4h 30m", date: "2024-11-06" },
    ],
    monthlyReturns: [
      { month: "Jan", value: 3.2 }, { month: "Feb", value: -1.4 }, { month: "Mar", value: 4.8 },
      { month: "Apr", value: 2.1 }, { month: "May", value: -0.6 }, { month: "Jun", value: 3.5 },
      { month: "Jul", value: 1.9 }, { month: "Aug", value: -2.1 }, { month: "Sep", value: 5.2 },
      { month: "Oct", value: 3.8 }, { month: "Nov", value: 4.1 }, { month: "Dec", value: 2.8 },
    ],
    equityCurve: generateEquityCurve(100000, 12, 0.024, 0.008),
  },
  {
    id: "2",
    title: "Mean Reversion Bollinger",
    description:
      "Statistical arbitrage strategy exploiting mean reversion in banking sector stocks using Bollinger Bands.",
    longDescription:
      "A market-neutral statistical arbitrage system that identifies overextended price movements in banking sector stocks. The algorithm monitors 2-standard-deviation Bollinger Band breaches on the 1-hour chart, entering counter-trend positions when price touches the outer band and RSI confirms overbought/oversold conditions. It uses a pairs-based hedging mechanism with Bank Nifty futures to maintain delta neutrality. Exits are triggered at the 20-period moving average (middle band) or at a 1% stop-loss from entry.",
    author: { name: "Priya Patel", isSebiVerified: true, avatar: "PP" },
    sharpeRatio: 2.14,
    cagr: 22.1,
    riskScore: "low",
    subscribers: 0,
    winRate: 72.1,
    minCapital: 100000,
    price: 1499,
    maxDrawdown: -5.2,
    profitFactor: 2.15,
    avgRiskReward: "1:1.8",
    totalTrades: 518,
    tradeLog: [
      { symbol: "SBIN", entryPrice: 812.4, exitPrice: 834.6, pnl: 5550, duration: "1d 6h", date: "2024-11-19" },
      { symbol: "KOTAKBANK", entryPrice: 1756.0, exitPrice: 1742.8, pnl: -1320, duration: "6h 15m", date: "2024-11-17" },
      { symbol: "AXISBANK", entryPrice: 1124.5, exitPrice: 1152.3, pnl: 2780, duration: "2d 1h", date: "2024-11-14" },
      { symbol: "HDFCBANK", entryPrice: 1702.0, exitPrice: 1728.4, pnl: 2640, duration: "1d 3h", date: "2024-11-11" },
      { symbol: "ICICIBANK", entryPrice: 1258.9, exitPrice: 1274.2, pnl: 1530, duration: "8h 20m", date: "2024-11-09" },
    ],
    monthlyReturns: [
      { month: "Jan", value: 2.1 }, { month: "Feb", value: 1.8 }, { month: "Mar", value: -0.9 },
      { month: "Apr", value: 2.4 }, { month: "May", value: 1.5 }, { month: "Jun", value: -0.3 },
      { month: "Jul", value: 3.1 }, { month: "Aug", value: 1.2 }, { month: "Sep", value: 2.8 },
      { month: "Oct", value: -0.7 }, { month: "Nov", value: 3.4 }, { month: "Dec", value: 2.2 },
    ],
    equityCurve: generateEquityCurve(100000, 12, 0.019, 0.005),
  },
  {
    id: "3",
    title: "MACD Trend Follower",
    description:
      "Classic trend following strategy optimized for Indian large-cap equities with dynamic stop-loss.",
    longDescription:
      "A robust trend-following system designed for the Indian large-cap universe. It utilizes a modified MACD indicator with custom parameters (8, 21, 5) on the daily timeframe, combined with ADX confirmation above 25 for trend strength validation. The system enters on MACD signal line crossovers when the stock is above its 50-day EMA. Position management employs a Chandelier Exit with 3x ATR, ensuring positions ride the trend while protecting against sudden reversals. Maximum portfolio allocation is 20% per stock with a 5-stock maximum.",
    author: { name: "Arjun Mehta", isSebiVerified: false, avatar: "AM" },
    sharpeRatio: 1.45,
    cagr: 18.7,
    riskScore: "low",
    subscribers: 2,
    winRate: 58.9,
    minCapital: 75000,
    price: null,
    maxDrawdown: -11.2,
    profitFactor: 1.54,
    avgRiskReward: "1:2.8",
    totalTrades: 187,
    tradeLog: [
      { symbol: "TATAMOTORS", entryPrice: 945.2, exitPrice: 1012.8, pnl: 6760, duration: "8d 2h", date: "2024-11-16" },
      { symbol: "LT", entryPrice: 3456.0, exitPrice: 3512.4, pnl: 5640, duration: "5d 4h", date: "2024-11-10" },
      { symbol: "WIPRO", entryPrice: 542.8, exitPrice: 528.4, pnl: -2880, duration: "3d 1h", date: "2024-11-05" },
      { symbol: "MARUTI", entryPrice: 11245.0, exitPrice: 11580.0, pnl: 3350, duration: "6d 7h", date: "2024-10-28" },
      { symbol: "BAJFINANCE", entryPrice: 7125.5, exitPrice: 7348.2, pnl: 2227, duration: "4d 5h", date: "2024-10-22" },
    ],
    monthlyReturns: [
      { month: "Jan", value: 1.4 }, { month: "Feb", value: -2.8 }, { month: "Mar", value: 5.2 },
      { month: "Apr", value: 0.8 }, { month: "May", value: -1.2 }, { month: "Jun", value: 2.4 },
      { month: "Jul", value: 3.6 }, { month: "Aug", value: -0.5 }, { month: "Sep", value: 1.8 },
      { month: "Oct", value: 2.9 }, { month: "Nov", value: -1.5 }, { month: "Dec", value: 4.1 },
    ],
    equityCurve: generateEquityCurve(100000, 12, 0.016, 0.01),
  },
  {
    id: "4",
    title: "Volatility Breakout Pro",
    description:
      "High-frequency breakout strategy for volatile market conditions. Requires active monitoring.",
    longDescription:
      "An aggressive intraday breakout system engineered for high-volatility market regimes. It identifies consolidation zones using a proprietary squeeze detection algorithm based on Keltner Channel and Bollinger Band convergence. When the squeeze fires (bands expand beyond Keltner), the system enters in the breakout direction with 2x leveraged positions. The strategy is most active during market-opening hours (9:15-10:30 AM IST) and around key economic data releases. Risk is managed with tight 0.5% stop-losses and automatic position flattening by 3:15 PM IST.",
    author: { name: "Sneha Gupta", isSebiVerified: true, avatar: "SG" },
    sharpeRatio: 1.78,
    cagr: 34.2,
    riskScore: "high",
    subscribers: 0,
    winRate: 54.2,
    minCapital: 200000,
    price: 2499,
    maxDrawdown: -15.8,
    profitFactor: 1.68,
    avgRiskReward: "1:3.2",
    totalTrades: 892,
    tradeLog: [
      { symbol: "NIFTY FUT", entryPrice: 24580.0, exitPrice: 24720.5, pnl: 10537, duration: "2h 45m", date: "2024-11-20" },
      { symbol: "BANKNIFTY FUT", entryPrice: 52340.0, exitPrice: 52180.0, pnl: -4800, duration: "1h 20m", date: "2024-11-19" },
      { symbol: "NIFTY FUT", entryPrice: 24420.0, exitPrice: 24510.0, pnl: 6750, duration: "3h 10m", date: "2024-11-18" },
      { symbol: "BANKNIFTY FUT", entryPrice: 52100.0, exitPrice: 52380.0, pnl: 8400, duration: "1h 55m", date: "2024-11-15" },
      { symbol: "NIFTY FUT", entryPrice: 24350.0, exitPrice: 24290.0, pnl: -4500, duration: "45m", date: "2024-11-14" },
    ],
    monthlyReturns: [
      { month: "Jan", value: 5.8 }, { month: "Feb", value: -3.2 }, { month: "Mar", value: 7.1 },
      { month: "Apr", value: -1.8 }, { month: "May", value: 4.2 }, { month: "Jun", value: 2.9 },
      { month: "Jul", value: -4.5 }, { month: "Aug", value: 6.4 }, { month: "Sep", value: 3.1 },
      { month: "Oct", value: 5.2 }, { month: "Nov", value: -2.4 }, { month: "Dec", value: 8.1 },
    ],
    equityCurve: generateEquityCurve(100000, 12, 0.029, 0.015),
  },
  {
    id: "5",
    title: "Pairs Trading Nifty",
    description:
      "Market-neutral pairs trading strategy on correlated Nifty stocks. Hedged approach.",
    longDescription:
      "A sophisticated market-neutral pairs trading system that identifies cointegrated stock pairs within the Nifty 50 universe using the Engle-Granger two-step method. The algorithm continuously monitors the spread z-score between identified pairs and enters positions when the spread deviates beyond 2 standard deviations. It simultaneously goes long the underperformer and short the outperformer, capturing the mean-reversion of the spread. The system recalibrates pair correlations weekly and drops pairs whose cointegration breaks down (ADF test p-value > 0.05).",
    author: { name: "Vikram Singh", isSebiVerified: false, avatar: "VS" },
    sharpeRatio: 1.34,
    cagr: 15.8,
    riskScore: "low",
    subscribers: 1,
    winRate: 65.7,
    minCapital: 150000,
    price: 799,
    maxDrawdown: -6.8,
    profitFactor: 1.72,
    avgRiskReward: "1:1.5",
    totalTrades: 428,
    tradeLog: [
      { symbol: "HDFC/ICICI", entryPrice: 1.335, exitPrice: 1.312, pnl: 3420, duration: "3d 2h", date: "2024-11-18" },
      { symbol: "TCS/INFY", entryPrice: 2.124, exitPrice: 2.098, pnl: 2180, duration: "2d 6h", date: "2024-11-15" },
      { symbol: "SBIN/PNB", entryPrice: 5.842, exitPrice: 5.912, pnl: -1540, duration: "1d 4h", date: "2024-11-12" },
      { symbol: "RELIANCE/ONGC", entryPrice: 11.25, exitPrice: 11.08, pnl: 4250, duration: "4d 1h", date: "2024-11-08" },
      { symbol: "HDFC/KOTAK", entryPrice: 0.956, exitPrice: 0.942, pnl: 2870, duration: "2d 5h", date: "2024-11-05" },
    ],
    monthlyReturns: [
      { month: "Jan", value: 1.2 }, { month: "Feb", value: 0.8 }, { month: "Mar", value: 1.5 },
      { month: "Apr", value: -0.4 }, { month: "May", value: 1.8 }, { month: "Jun", value: 1.1 },
      { month: "Jul", value: -0.9 }, { month: "Aug", value: 2.1 }, { month: "Sep", value: 1.4 },
      { month: "Oct", value: 1.6 }, { month: "Nov", value: 0.7 }, { month: "Dec", value: 1.9 },
    ],
    equityCurve: generateEquityCurve(100000, 12, 0.014, 0.004),
  },
  {
    id: "6",
    title: "Options Strangle Seller",
    description:
      "Premium collection strategy using weekly options on Bank Nifty. Advanced risk management required.",
    longDescription:
      "An options premium harvesting strategy that systematically sells weekly out-of-the-money strangles on Bank Nifty. The algorithm selects strike prices at approximately 1.5 standard deviations from the current price, collecting theta decay as the primary profit driver. Position sizing is calibrated to maintain margin utilization below 60%, with automatic adjustments triggered when delta exceeds ±0.25. The system implements a robust hedging mechanism using far OTM protective options (iron condor conversion) when VIX crosses above 18, and completely exits positions 30 minutes before major RBI announcements.",
    author: { name: "Deepika Reddy", isSebiVerified: true, avatar: "DR" },
    sharpeRatio: 2.45,
    cagr: 42.1,
    riskScore: "high",
    subscribers: 2,
    winRate: 78.3,
    minCapital: 500000,
    price: 3999,
    maxDrawdown: -12.6,
    profitFactor: 2.42,
    avgRiskReward: "1:0.8",
    totalTrades: 624,
    tradeLog: [
      { symbol: "BANKNIFTY 53000CE", entryPrice: 245.0, exitPrice: 12.5, pnl: 17437, duration: "4d 5h", date: "2024-11-20" },
      { symbol: "BANKNIFTY 51500PE", entryPrice: 180.0, exitPrice: 8.0, pnl: 12900, duration: "4d 5h", date: "2024-11-20" },
      { symbol: "BANKNIFTY 52800CE", entryPrice: 310.0, exitPrice: 425.0, pnl: -8625, duration: "2d 3h", date: "2024-11-14" },
      { symbol: "BANKNIFTY 52500CE", entryPrice: 195.0, exitPrice: 22.0, pnl: 12975, duration: "5d", date: "2024-11-08" },
      { symbol: "BANKNIFTY 51000PE", entryPrice: 155.0, exitPrice: 5.0, pnl: 11250, duration: "5d", date: "2024-11-08" },
    ],
    monthlyReturns: [
      { month: "Jan", value: 4.2 }, { month: "Feb", value: 3.8 }, { month: "Mar", value: -5.1 },
      { month: "Apr", value: 5.5 }, { month: "May", value: 4.1 }, { month: "Jun", value: 3.2 },
      { month: "Jul", value: -2.8 }, { month: "Aug", value: 6.2 }, { month: "Sep", value: 4.8 },
      { month: "Oct", value: 5.1 }, { month: "Nov", value: 3.9 }, { month: "Dec", value: 7.4 },
    ],
    equityCurve: generateEquityCurve(100000, 12, 0.035, 0.012),
  },
];

export function getStrategyById(id: string): StrategyDetail | undefined {
  return strategies.find((s) => s.id === id);
}
