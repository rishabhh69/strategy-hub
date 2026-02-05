import { TrendingUp, TrendingDown } from "lucide-react";

interface TickerItem {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
}

const mockTickers: TickerItem[] = [
  { symbol: "RELIANCE", price: 2847.65, change: 42.30, changePercent: 1.51 },
  { symbol: "TATAMOTORS", price: 985.20, change: -12.45, changePercent: -1.25 },
  { symbol: "HDFCBANK", price: 1672.40, change: 28.90, changePercent: 1.76 },
  { symbol: "TCS", price: 3890.55, change: -35.20, changePercent: -0.90 },
  { symbol: "INFY", price: 1542.80, change: 18.65, changePercent: 1.22 },
  { symbol: "WIPRO", price: 478.35, change: -5.80, changePercent: -1.20 },
  { symbol: "ICICIBANK", price: 1198.70, change: 22.45, changePercent: 1.91 },
  { symbol: "SBIN", price: 825.40, change: 11.20, changePercent: 1.38 },
];

const TickerItem = ({ ticker }: { ticker: TickerItem }) => {
  const isPositive = ticker.change >= 0;
  
  return (
    <div className="flex items-center gap-3 px-4 whitespace-nowrap">
      <span className="font-medium text-foreground">{ticker.symbol}</span>
      <span className="font-data text-muted-foreground">
        ₹{ticker.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
      </span>
      <span className={`flex items-center gap-1 font-data text-sm ${isPositive ? 'text-profit' : 'text-loss'}`}>
        {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        {isPositive ? '+' : ''}{ticker.changePercent.toFixed(2)}%
      </span>
    </div>
  );
};

export function TickerTape() {
  const duplicatedTickers = [...mockTickers, ...mockTickers];
  
  return (
    <div className="bg-sidebar border-b border-sidebar-border overflow-hidden">
      <div className="flex animate-ticker">
        {duplicatedTickers.map((ticker, index) => (
          <TickerItem key={`${ticker.symbol}-${index}`} ticker={ticker} />
        ))}
      </div>
    </div>
  );
}
