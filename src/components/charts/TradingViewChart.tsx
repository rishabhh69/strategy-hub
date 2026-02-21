/**
 * TradingViewChart — lightweight-charts v5 with full indicator suite
 *
 * Overlay (main chart):  SMA 20/50 · EMA 9/20 · Bollinger Bands · VWAP · Volume
 * Panel (sub-chart):     RSI 14
 */

import { useEffect, useRef, useCallback, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  IChartApi,
  ISeriesApi,
  ColorType,
  CrosshairMode,
  Time,
  LineData,
  HistogramData,
} from "lightweight-charts";

// ─── Types ───────────────────────────────────────────────────────────────────
interface CandleBar {
  time: number;
  open: number; high: number; low: number; close: number;
  volume?: number;
}
interface FetchResult { candles: CandleBar[]; market_closed: boolean; interval: string; }

type IndicatorId = "SMA20" | "SMA50" | "EMA9" | "EMA20" | "BB" | "VWAP" | "VOL" | "RSI";

const IND_META: Record<IndicatorId, { label: string; color: string; panel?: true }> = {
  SMA20: { label: "SMA 20", color: "#3b82f6" },
  SMA50: { label: "SMA 50", color: "#f97316" },
  EMA9:  { label: "EMA 9",  color: "#06b6d4" },
  EMA20: { label: "EMA 20", color: "#a855f7" },
  BB:    { label: "BB",     color: "#64748b" },
  VWAP:  { label: "VWAP",  color: "#ec4899" },
  VOL:   { label: "Vol",   color: "#374151" },
  RSI:   { label: "RSI 14",color: "#f59e0b", panel: true },
};

const IND_ORDER: IndicatorId[] = ["SMA20","SMA50","EMA9","EMA20","BB","VWAP","VOL","RSI"];

interface TradingViewChartProps {
  ticker:       string;
  pollInterval?: number;
  height?:       number;
  interval?:    "1m" | "5m";
}

const API_BASE = "http://127.0.0.1:8000";

// ─── Indicator math ───────────────────────────────────────────────────────────
function calcSMA(d: number[], p: number): (number|null)[] {
  return d.map((_, i) =>
    i < p - 1 ? null : d.slice(i - p + 1, i + 1).reduce((a, b) => a + b, 0) / p
  );
}
function calcEMA(d: number[], p: number): (number|null)[] {
  const k = 2 / (p + 1);
  const out: (number|null)[] = new Array(d.length).fill(null);
  if (d.length < p) return out;
  out[p - 1] = d.slice(0, p).reduce((a, b) => a + b, 0) / p;
  for (let i = p; i < d.length; i++) out[i] = d[i] * k + out[i - 1]! * (1 - k);
  return out;
}
function calcBB(d: number[], p = 20, m = 2) {
  const mid = calcSMA(d, p);
  const upper: (number|null)[] = [], lower: (number|null)[] = [];
  d.forEach((_, i) => {
    if (i < p - 1) { upper.push(null); lower.push(null); return; }
    const sl = d.slice(i - p + 1, i + 1), avg = mid[i]!;
    const std = Math.sqrt(sl.reduce((s, v) => s + (v - avg) ** 2, 0) / p);
    upper.push(avg + m * std); lower.push(avg - m * std);
  });
  return { mid, upper, lower };
}
function calcRSI(d: number[], p = 14): (number|null)[] {
  const out: (number|null)[] = new Array(d.length).fill(null);
  if (d.length < p + 1) return out;
  let ag = 0, al = 0;
  for (let i = 1; i <= p; i++) { const x = d[i] - d[i-1]; ag += Math.max(0,x); al += Math.max(0,-x); }
  ag /= p; al /= p;
  out[p] = 100 - 100 / (1 + ag / (al || 1e-10));
  for (let i = p + 1; i < d.length; i++) {
    const x = d[i] - d[i-1];
    ag = (ag * (p-1) + Math.max(0,x)) / p;
    al = (al * (p-1) + Math.max(0,-x)) / p;
    out[i] = 100 - 100 / (1 + ag / (al || 1e-10));
  }
  return out;
}
function calcVWAP(bars: CandleBar[]): (number|null)[] {
  let cv = 0, cpv = 0;
  return bars.map(c => {
    const v = c.volume ?? 0; if (!v) return null;
    cpv += ((c.high + c.low + c.close) / 3) * v; cv += v;
    return cv > 0 ? cpv / cv : null;
  });
}
function toLineData(vals: (number|null)[], times: number[]): LineData[] {
  return vals
    .map((v, i) => v != null ? { time: times[i] as Time, value: v } : null)
    .filter(Boolean) as LineData[];
}

// ─── Chart theme ─────────────────────────────────────────────────────────────
const THEME = {
  layout:   { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#94a3b8", fontFamily:"'Inter',sans-serif", fontSize: 11 },
  grid:     { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.04)" } },
  crosshair:{ mode: CrosshairMode.Normal },
  rightPriceScale:{ borderColor: "rgba(255,255,255,0.08)" },
  timeScale:{ borderColor: "rgba(255,255,255,0.08)", timeVisible: true, secondsVisible: false },
};

// ─── Indicator series store ───────────────────────────────────────────────────
interface IndSeriesStore {
  SMA20?:   ISeriesApi<"Line">;
  SMA50?:   ISeriesApi<"Line">;
  EMA9?:    ISeriesApi<"Line">;
  EMA20?:   ISeriesApi<"Line">;
  bbUpper?: ISeriesApi<"Line">;
  bbMid?:   ISeriesApi<"Line">;
  bbLower?: ISeriesApi<"Line">;
  VWAP?:    ISeriesApi<"Line">;
  VOL?:     ISeriesApi<"Histogram">;
}

// ─── Component ───────────────────────────────────────────────────────────────
export function TradingViewChart({
  ticker,
  pollInterval = 60_000,
  height = 320,
  interval = "5m",
}: TradingViewChartProps) {
  const containerRef   = useRef<HTMLDivElement>(null);
  const rsiContainerRef= useRef<HTMLDivElement>(null);
  const chartRef       = useRef<IChartApi | null>(null);
  const rsiChartRef    = useRef<IChartApi | null>(null);
  const seriesRef      = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const rsiSeriesRef   = useRef<ISeriesApi<"Line"> | null>(null);
  const indRef         = useRef<IndSeriesStore>({});
  const lastTimeRef    = useRef<number>(0);
  const loadedRef      = useRef<boolean>(false);
  const candlesRef     = useRef<CandleBar[]>([]);   // latest data, no re-render

  const [loading,       setLoading]       = useState(true);
  const [hasData,       setHasData]       = useState(false);
  const [error,         setError]         = useState<string|null>(null);
  const [marketClosed,  setMarketClosed]  = useState(false);
  const [activeInds,    setActiveInds]    = useState<Set<IndicatorId>>(new Set());

  const RSI_HEIGHT = 80;
  const mainHeight = activeInds.has("RSI") ? height - RSI_HEIGHT - 4 : height;

  // ── Toggle indicator ──────────────────────────────────────────────────────
  const toggleInd = (id: IndicatorId) => {
    setActiveInds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Compute & push indicator data ─────────────────────────────────────────
  const applyIndicators = useCallback((bars: CandleBar[]) => {
    if (!bars.length) return;
    const closes = bars.map(b => b.close);
    const times  = bars.map(b => b.time);
    const ind    = indRef.current;

    ind.SMA20?.setData(toLineData(calcSMA(closes, 20), times));
    ind.SMA50?.setData(toLineData(calcSMA(closes, 50), times));
    ind.EMA9?.setData(toLineData(calcEMA(closes, 9),  times));
    ind.EMA20?.setData(toLineData(calcEMA(closes, 20), times));

    const bb = calcBB(closes);
    ind.bbUpper?.setData(toLineData(bb.upper, times));
    ind.bbMid?.setData(toLineData(bb.mid, times));
    ind.bbLower?.setData(toLineData(bb.lower, times));

    ind.VWAP?.setData(toLineData(calcVWAP(bars), times));

    const volData: HistogramData[] = bars
      .filter(b => b.volume != null)
      .map(b => ({
        time:  b.time as Time,
        value: b.volume!,
        color: b.close >= b.open ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)",
      }));
    ind.VOL?.setData(volData);

    // RSI sub-chart
    if (rsiSeriesRef.current) {
      const rsiVals = calcRSI(closes);
      rsiSeriesRef.current.setData(toLineData(rsiVals, times));
    }
  }, []);

  // ── Sync indicator visibility ─────────────────────────────────────────────
  useEffect(() => {
    const ind = indRef.current;
    const has = (id: IndicatorId) => activeInds.has(id);

    ind.SMA20?.applyOptions({ visible: has("SMA20") });
    ind.SMA50?.applyOptions({ visible: has("SMA50") });
    ind.EMA9?.applyOptions({ visible: has("EMA9") });
    ind.EMA20?.applyOptions({ visible: has("EMA20") });
    const bbOn = has("BB");
    ind.bbUpper?.applyOptions({ visible: bbOn });
    ind.bbMid?.applyOptions({ visible: bbOn });
    ind.bbLower?.applyOptions({ visible: bbOn });
    ind.VWAP?.applyOptions({ visible: has("VWAP") });
    ind.VOL?.applyOptions({ visible: has("VOL") });
  }, [activeInds]);

  // ── RSI chart: create / destroy when RSI toggled ──────────────────────────
  useEffect(() => {
    if (activeInds.has("RSI")) {
      if (!rsiContainerRef.current || rsiChartRef.current) return;
      const c = createChart(rsiContainerRef.current, {
        ...THEME,
        width:  rsiContainerRef.current.clientWidth,
        height: RSI_HEIGHT,
        rightPriceScale: { ...THEME.rightPriceScale, scaleMargins: { top: 0.1, bottom: 0.1 } },
      });
      const s = c.addSeries(LineSeries, {
        color: "#f59e0b", lineWidth: 1,
        priceLineVisible: false, lastValueVisible: true,
        crosshairMarkerVisible: false,
      }) as ISeriesApi<"Line">;
      // 30/70 reference lines
      const rro = new ResizeObserver(() => {
        if (rsiContainerRef.current) c.applyOptions({ width: rsiContainerRef.current.clientWidth });
      });
      if (rsiContainerRef.current) rro.observe(rsiContainerRef.current);
      rsiChartRef.current  = c;
      rsiSeriesRef.current = s;
      // Apply existing data
      if (candlesRef.current.length) applyIndicators(candlesRef.current);
      return () => { rro.disconnect(); };
    } else {
      if (rsiChartRef.current) {
        try { rsiChartRef.current.remove(); } catch {}
        rsiChartRef.current  = null;
        rsiSeriesRef.current = null;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeInds.has("RSI")]);

  // ── Resize main chart when RSI panel opens/closes ─────────────────────────
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.applyOptions({ height: mainHeight });
    }
  }, [mainHeight]);

  // ── Fetch candles ─────────────────────────────────────────────────────────
  const fetchCandles = useCallback(async (): Promise<FetchResult> => {
    const res = await fetch(
      `${API_BASE}/candles/${encodeURIComponent(ticker)}?period=1d&interval=${interval}`,
    );
    if (!res.ok) return { candles: [], market_closed: false, interval };
    const json = await res.json();
    return {
      candles:       Array.isArray(json.candles) ? json.candles : [],
      market_closed: !!json.market_closed,
      interval:      json.interval ?? interval,
    };
  }, [ticker, interval]);

  // ── Load candles into chart ────────────────────────────────────────────────
  const loadCandles = useCallback(async (isInitial: boolean) => {
    if (!seriesRef.current) return;
    try {
      const { candles, market_closed } = await fetchCandles();
      if (!candles.length) { if (isInitial) { setHasData(false); setLoading(false); } return; }

      const sorted = [...candles]
        .sort((a, b) => a.time - b.time)
        .filter((b, i, arr) => i === 0 || b.time !== arr[i - 1].time);

      if (!seriesRef.current) return;

      if (!loadedRef.current || isInitial) {
        seriesRef.current.setData(sorted.map(b => ({
          time: b.time as Time, open: b.open, high: b.high, low: b.low, close: b.close,
        })));
        lastTimeRef.current = sorted[sorted.length - 1].time;
        chartRef.current?.timeScale().fitContent();
        loadedRef.current = true;
        setHasData(true); setMarketClosed(market_closed); setError(null); setLoading(false);
      } else {
        const latest = sorted[sorted.length - 1];
        if (latest.time >= lastTimeRef.current) {
          seriesRef.current.update({
            time: latest.time as Time, open: latest.open,
            high: latest.high, low: latest.low, close: latest.close,
          });
          lastTimeRef.current = latest.time;
        }
        setMarketClosed(market_closed);
      }

      // Always recompute indicators with latest data
      candlesRef.current = sorted;
      applyIndicators(sorted);

    } catch (err) {
      if (isInitial && !loadedRef.current) {
        setError(`Failed to load: ${String(err)}`); setLoading(false);
      }
    }
  }, [fetchCandles, applyIndicators]);

  // ── Create chart ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    loadedRef.current = false; lastTimeRef.current = 0;
    candlesRef.current = [];

    let chart: IChartApi;
    try {
      chart = createChart(containerRef.current, {
        ...THEME,
        width:  containerRef.current.clientWidth,
        height: mainHeight,
      });

      // ── Candlestick series ────────────────────────────────────────────
      const cs = chart.addSeries(CandlestickSeries, {
        upColor: "#22c55e", downColor: "#ef4444",
        borderUpColor: "#22c55e", borderDownColor: "#ef4444",
        wickUpColor: "#22c55e", wickDownColor: "#ef4444",
      }) as ISeriesApi<"Candlestick">;
      seriesRef.current = cs;

      const lineOpts = (color: string, visible = false) => ({
        color, lineWidth: 1 as const, visible,
        priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      });

      // ── Overlay series (all created upfront, hidden by default) ──────
      indRef.current = {
        SMA20:   chart.addSeries(LineSeries, lineOpts("#3b82f6")) as ISeriesApi<"Line">,
        SMA50:   chart.addSeries(LineSeries, lineOpts("#f97316")) as ISeriesApi<"Line">,
        EMA9:    chart.addSeries(LineSeries, lineOpts("#06b6d4")) as ISeriesApi<"Line">,
        EMA20:   chart.addSeries(LineSeries, lineOpts("#a855f7")) as ISeriesApi<"Line">,
        bbUpper: chart.addSeries(LineSeries, { ...lineOpts("#475569"), lineStyle: 2 }) as ISeriesApi<"Line">,
        bbMid:   chart.addSeries(LineSeries, { ...lineOpts("#64748b"), lineStyle: 1 }) as ISeriesApi<"Line">,
        bbLower: chart.addSeries(LineSeries, { ...lineOpts("#475569"), lineStyle: 2 }) as ISeriesApi<"Line">,
        VWAP:    chart.addSeries(LineSeries, { ...lineOpts("#ec4899"), lineWidth: 2 as const }) as ISeriesApi<"Line">,
        VOL:     chart.addSeries(HistogramSeries, {
          color: "rgba(34,197,94,0.3)", visible: false, priceScaleId: "vol",
          priceLineVisible: false, lastValueVisible: false,
        }) as ISeriesApi<"Histogram">,
      };
      // Volume uses an overlay price scale
      chart.priceScale("vol").applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
        autoScale: true,
      });

      chartRef.current = chart;
    } catch (err) {
      setError(`Chart init failed: ${String(err)}`); setLoading(false); return;
    }

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current)
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);

    setLoading(true); setError(null); setHasData(false);
    loadCandles(true);

    return () => {
      ro.disconnect();
      try { chart.remove(); } catch {}
      chartRef.current = null; seriesRef.current = null;
      indRef.current = {};
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, interval]);

  // ── Polling ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      if (!seriesRef.current) return;
      loadCandles(!loadedRef.current);
    }, pollInterval);
    return () => clearInterval(id);
  }, [loadCandles, pollInterval]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col w-full" style={{ height }}>

      {/* ── Indicator toggle chips ── */}
      <div className="flex flex-wrap items-center gap-1 px-1 pb-1.5 shrink-0">
        {IND_ORDER.map(id => {
          const meta = IND_META[id];
          const on   = activeInds.has(id);
          return (
            <button
              key={id}
              onClick={() => toggleInd(id)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium border transition-all ${
                on
                  ? "border-transparent text-black"
                  : "border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
              }`}
              style={on ? { backgroundColor: meta.color } : {}}
            >
              {on && <span className="w-1.5 h-1.5 rounded-full bg-white/80 inline-block" />}
              {meta.label}
            </button>
          );
        })}
      </div>

      {/* ── Main chart ── */}
      <div className="relative flex-1 min-h-0">
        <div ref={containerRef} className="w-full h-full" />

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-sm z-10">
            <div className="flex flex-col items-center gap-2">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-muted-foreground">Loading {ticker}…</span>
            </div>
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-loss">⚠ {error}</p>
          </div>
        )}
        {!loading && !hasData && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-muted-foreground">No candle data for {ticker}</p>
          </div>
        )}
        {marketClosed && hasData && (
          <div className="absolute top-1 right-1 z-10">
            <span className="text-[9px] font-mono text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
              Historical · Market Closed
            </span>
          </div>
        )}
      </div>

      {/* ── RSI sub-chart ── */}
      {activeInds.has("RSI") && (
        <div className="shrink-0 border-t border-border/40 pt-0.5">
          <div className="flex items-center justify-between px-1 mb-0.5">
            <span className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-wider">RSI 14</span>
            <span className="text-[9px] font-mono text-muted-foreground/50">30 · 70</span>
          </div>
          <div ref={rsiContainerRef} className="w-full" style={{ height: RSI_HEIGHT }} />
        </div>
      )}
    </div>
  );
}
