import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  volume: number;
  timestamp: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol } = await req.json();
    
    if (!symbol) {
      throw new Error("Symbol is required");
    }

    // Use Yahoo Finance API (free, no key required)
    const yahooSymbol = symbol.endsWith(".NS") ? symbol : `${symbol}.NS`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1m&range=1d`;
    
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance API error: ${response.status}`);
    }

    const data = await response.json();
    const result = data.chart?.result?.[0];
    
    if (!result) {
      throw new Error("No data found for symbol");
    }

    const meta = result.meta;
    const quote = result.indicators?.quote?.[0];
    const timestamps = result.timestamp || [];
    
    // Get latest price data
    const latestIndex = timestamps.length - 1;
    const currentPrice = meta.regularMarketPrice || quote?.close?.[latestIndex] || 0;
    const previousClose = meta.previousClose || meta.chartPreviousClose || currentPrice;
    const change = currentPrice - previousClose;
    const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

    // Build intraday chart data
    const chartData = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (quote?.close?.[i] != null) {
        const date = new Date(timestamps[i] * 1000);
        chartData.push({
          time: date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
          timestamp: timestamps[i],
          price: quote.close[i],
          open: quote.open?.[i] || quote.close[i],
          high: quote.high?.[i] || quote.close[i],
          low: quote.low?.[i] || quote.close[i],
          volume: quote.volume?.[i] || 0,
        });
      }
    }

    const stockQuote: StockQuote = {
      symbol: yahooSymbol,
      price: currentPrice,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
      high: meta.regularMarketDayHigh || Math.max(...(quote?.high || [currentPrice])),
      low: meta.regularMarketDayLow || Math.min(...(quote?.low || [currentPrice])),
      open: meta.regularMarketOpen || quote?.open?.[0] || currentPrice,
      previousClose: previousClose,
      volume: meta.regularMarketVolume || 0,
      timestamp: new Date().toISOString(),
    };

    return new Response(
      JSON.stringify({
        quote: stockQuote,
        chartData: chartData,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Stock quote error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
