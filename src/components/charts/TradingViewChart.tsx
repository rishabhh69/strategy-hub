/**
 * TradingView Candlestick Chart — lightweight-charts v5 compatible
 *
 * Breaking change from v4→v5:
 *   OLD: chart.addCandlestickSeries({ ... })          ← removed in v5
 *   NEW: chart.addSeries(CandlestickSeries, { ... })  ← v5 API
 */

import { useEffect, useRef, useCallback, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  IChartApi,
  ISeriesApi,
  ColorType,
  CrosshairMode,
  Time,
} from "lightweight-charts";

interface CandleBar {
  time: number;  // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface FetchResult {
  candles: CandleBar[];
  market_closed: boolean;
  interval: string;
}

interface TradingViewChartProps {
  ticker: string;
  pollInterval?: number; // ms, default 60 s
  height?: number;       // px, default 320
}

const API_BASE = "http://127.0.0.1:8000";

export function TradingViewChart({
  ticker,
  pollInterval = 60_000,
  height = 320,
}: TradingViewChartProps) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const chartRef      = useRef<IChartApi | null>(null);
  const seriesRef     = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lastTimeRef   = useRef<number>(0);
  const loadedRef     = useRef<boolean>(false);  // true after first successful setData

  const [loading, setLoading]           = useState(true);
  const [hasData, setHasData]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [marketClosed, setMarketClosed] = useState(false);

  // ── Fetch candles from backend ─────────────────────────────────────────────
  const fetchCandles = useCallback(async (): Promise<FetchResult> => {
    const res = await fetch(
      `${API_BASE}/candles/${encodeURIComponent(ticker)}?period=1d&interval=5m`,
    );
    if (!res.ok) return { candles: [], market_closed: false, interval: "5m" };
    const json = await res.json();
    return {
      candles:       Array.isArray(json.candles) ? json.candles : [],
      market_closed: !!json.market_closed,
      interval:      json.interval ?? "5m",
    };
  }, [ticker]);

  // ── Load (or reload) candles into the chart ────────────────────────────────
  // Called on both initial mount and on every poll tick.
  // On first success → setData; on subsequent success → update last candle.
  const loadCandles = useCallback(
    async (isInitial: boolean) => {
      if (!seriesRef.current) return;
      try {
        const { candles, market_closed } = await fetchCandles();

        if (candles.length === 0) {
          if (isInitial) {
            setHasData(false);
            setLoading(false);
          }
          return;
        }

        const sorted = [...candles]
          .sort((a, b) => a.time - b.time)
          .filter((b, i, arr) => i === 0 || b.time !== arr[i - 1].time);

        if (!seriesRef.current) return;

        if (!loadedRef.current || isInitial) {
          // Full load — replace all data
          seriesRef.current.setData(
            sorted.map((b) => ({
              time:  b.time as Time,
              open:  b.open,
              high:  b.high,
              low:   b.low,
              close: b.close,
            })),
          );
          lastTimeRef.current = sorted[sorted.length - 1].time;
          chartRef.current?.timeScale().fitContent();
          loadedRef.current = true;
          setHasData(true);
          setMarketClosed(market_closed);
          setError(null);
          setLoading(false);
        } else {
          // Poll tick — just update the latest candle
          const latest = sorted[sorted.length - 1];
          if (latest.time >= lastTimeRef.current) {
            seriesRef.current.update({
              time:  latest.time as Time,
              open:  latest.open,
              high:  latest.high,
              low:   latest.low,
              close: latest.close,
            });
            lastTimeRef.current = latest.time;
          }
          setMarketClosed(market_closed);
        }
      } catch (err) {
        if (isInitial && !loadedRef.current) {
          // Only show error on initial load failure; retry via polling
          console.error("[TradingViewChart] Initial load failed:", err);
          setError(`Failed to load candles: ${String(err)}`);
          setLoading(false);
        }
        // On poll failure, silently ignore — next poll will retry
      }
    },
    [fetchCandles],
  );

  // ── Create chart once per ticker ───────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    loadedRef.current  = false;
    lastTimeRef.current = 0;

    let chart: IChartApi;
    let series: ISeriesApi<"Candlestick">;

    try {
      chart = createChart(containerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "#94a3b8",
          fontFamily: "'Inter', sans-serif",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: "rgba(255,255,255,0.05)" },
          horzLines: { color: "rgba(255,255,255,0.05)" },
        },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: "rgba(255,255,255,0.1)" },
        timeScale: {
          borderColor:    "rgba(255,255,255,0.1)",
          timeVisible:    true,
          secondsVisible: false,
        },
        width:  containerRef.current.clientWidth,
        height,
      });

      series = chart.addSeries(CandlestickSeries, {
        upColor:         "#22c55e",
        downColor:       "#ef4444",
        borderUpColor:   "#22c55e",
        borderDownColor: "#ef4444",
        wickUpColor:     "#22c55e",
        wickDownColor:   "#ef4444",
      }) as ISeriesApi<"Candlestick">;

      chartRef.current  = chart;
      seriesRef.current = series;
    } catch (err) {
      setError(`Chart init failed: ${String(err)}`);
      setLoading(false);
      return;
    }

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(containerRef.current);

    // Initial data load
    setLoading(true);
    setError(null);
    setHasData(false);
    loadCandles(true);

    return () => {
      ro.disconnect();
      try { chart.remove(); } catch { /* already removed */ }
      chartRef.current  = null;
      seriesRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, height]);

  // ── Polling — also retries full load if initial failed ────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      if (!seriesRef.current) return;
      // If never loaded successfully, do a full reload; else just update tail
      const isRetry = !loadedRef.current;
      loadCandles(isRetry);
    }, pollInterval);
    return () => clearInterval(id);
  }, [loadCandles, pollInterval]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: "relative", width: "100%", height }} className="rounded-sm overflow-hidden">
      <div ref={containerRef} style={{ width: "100%", height }} />

      {/* Market-closed / historical-data badge */}
      {hasData && marketClosed && (
        <div
          style={{ position: "absolute", top: 8, right: 8 }}
          className="px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
        >
          Historical · Market Closed
        </div>
      )}

      {/* Loading overlay */}
      {loading && (
        <div
          style={{ position: "absolute", inset: 0 }}
          className="flex items-center justify-center bg-card/60 backdrop-blur-sm"
        >
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <svg className="w-6 h-6 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <span className="text-xs">Loading chart…</span>
          </div>
        </div>
      )}

      {/* No data */}
      {!loading && !hasData && !error && (
        <div
          style={{ position: "absolute", inset: 0 }}
          className="flex flex-col items-center justify-center text-muted-foreground gap-2"
        >
          <svg className="w-8 h-8 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
          </svg>
          <p className="text-xs">No chart data — market may be closed</p>
        </div>
      )}

      {/* Error — shows retry hint */}
      {error && !hasData && (
        <div
          style={{ position: "absolute", inset: 0 }}
          className="flex flex-col items-center justify-center text-loss text-xs p-4 text-center gap-2"
        >
          <span>{error}</span>
          <span className="text-muted-foreground">Retrying automatically…</span>
        </div>
      )}
    </div>
  );
}
