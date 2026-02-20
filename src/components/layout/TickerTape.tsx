import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface TickerItem {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
}

const tickerSymbols = [
  "RELIANCE",
  "BAJFINANCE",
  "HDFCBANK",
  "TCS",
  "INFY",
  "WIPRO",
  "ICICIBANK",
  "SBIN",
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
  const [tickers, setTickers] = useState<TickerItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchTickers = async () => {
      try {
        // Single batch request to avoid "too many requests"
        const q = tickerSymbols.join(",");
        const response = await fetch(`http://127.0.0.1:8000/quotes?tickers=${encodeURIComponent(q)}`);
        if (!response.ok) {
          if (response.status === 429 || response.status === 503) {
            // Rate limited - will retry on next interval
          }
          setIsLoading(false);
          return;
        }
        const data = await response.json();
        const validTickers: TickerItem[] = (Array.isArray(data) ? data : []).map(
          (row: { ticker: string; price: number; change_percent: number }) => ({
            symbol: row.ticker,
            price: row.price,
            change: (row.price * row.change_percent) / 100,
            changePercent: row.change_percent,
          })
        );
        setTickers(validTickers);
      } catch (error) {
        console.error("Failed to fetch tickers:", error);
      } finally {
        setIsLoading(false);
      }
    };

    // Fetch immediately
    fetchTickers();

    // Poll every 30 seconds to avoid 429 rate limits
    const interval = setInterval(fetchTickers, 30000);

    return () => clearInterval(interval);
  }, []);

  // Use empty array or show loading state if no data
  if (isLoading && tickers.length === 0) {
    return (
      <div className="bg-sidebar border-b border-sidebar-border overflow-hidden">
        <div className="flex items-center justify-center py-2">
          <span className="text-xs text-muted-foreground">Loading market data...</span>
        </div>
      </div>
    );
  }

  if (tickers.length === 0) {
    return null;
  }

  // Duplicate tickers for seamless scrolling
  const duplicatedTickers = [...tickers, ...tickers];
  
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
