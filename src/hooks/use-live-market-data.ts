import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

interface ChartDataPoint {
  time: string;
  timestamp: number;
  price: number;
  open: number;
  high: number;
  low: number;
  volume: number;
}

interface RiskAnalysis {
  shouldExit: boolean;
  severity: "low" | "medium" | "high" | "critical";
  drawdownPercent: number;
  reason: string;
  recommendation: string;
  signals: string[];
}

interface Position {
  symbol: string;
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  pnl: number;
}

export function useLiveMarketData(symbol: string, pollInterval = 5000) {
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchQuote = useCallback(async () => {
    try {
      const { data, error: fnError } = await supabase.functions.invoke("stock-quote", {
        body: { symbol },
      });

      if (fnError) throw fnError;
      if (data.error) throw new Error(data.error);

      setQuote(data.quote);
      setChartData(data.chartData || []);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      console.error("Failed to fetch quote:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setIsLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    setIsLoading(true);
    fetchQuote();

    const interval = setInterval(fetchQuote, pollInterval);
    return () => clearInterval(interval);
  }, [fetchQuote, pollInterval]);

  return { quote, chartData, isLoading, error, lastUpdated, refetch: fetchQuote };
}

export function useRiskMonitor(
  portfolioValue: number,
  peakValue: number,
  positions: Position[],
  recentPrices: number[],
  drawdownThreshold = 5,
  enabled = true
) {
  const [riskAnalysis, setRiskAnalysis] = useState<RiskAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const hasExitedRef = useRef(false);
  const lastAnalysisRef = useRef<number>(0);

  const analyzeRisk = useCallback(async () => {
    // Throttle analysis to every 10 seconds minimum
    const now = Date.now();
    if (now - lastAnalysisRef.current < 10000) return;
    lastAnalysisRef.current = now;

    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("risk-monitor", {
        body: {
          peakValue,
          currentValue: portfolioValue,
          entryPrice: positions[0]?.entryPrice || 0,
          currentPrice: positions[0]?.currentPrice || 0,
          positions,
          drawdownThreshold,
          recentPrices,
        },
      });

      if (error) throw error;

      setRiskAnalysis(data);

      // Trigger exit alert if needed (only once per breach)
      if (data.shouldExit && !hasExitedRef.current) {
        hasExitedRef.current = true;
        toast.error("🚨 RISK ALERT: Exit Signal Triggered", {
          description: data.reason,
          duration: 10000,
        });
      } else if (!data.shouldExit) {
        hasExitedRef.current = false;
      }
    } catch (err) {
      console.error("Risk analysis error:", err);
    } finally {
      setIsAnalyzing(false);
    }
  }, [portfolioValue, peakValue, positions, recentPrices, drawdownThreshold]);

  useEffect(() => {
    if (!enabled || portfolioValue <= 0) return;

    analyzeRisk();
    const interval = setInterval(analyzeRisk, 15000); // Analyze every 15 seconds
    return () => clearInterval(interval);
  }, [analyzeRisk, enabled, portfolioValue]);

  const resetExitFlag = useCallback(() => {
    hasExitedRef.current = false;
  }, []);

  return { riskAnalysis, isAnalyzing, analyzeRisk, resetExitFlag };
}
