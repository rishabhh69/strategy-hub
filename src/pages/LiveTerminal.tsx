import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { Button }    from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge }     from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectGroup, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp, TrendingDown, Activity, AlertTriangle, Square,
  Radio, ArrowUpRight, ArrowDownRight, Clock, Zap, RefreshCw,
  Bot, Rocket, Plus, X, RotateCcw, IndianRupee, ListOrdered, Ban, Brain,
} from "lucide-react";
import { MainLayout }         from "@/components/layout/MainLayout";
import { TradingViewChart }   from "@/components/charts/TradingViewChart";
import { toast }              from "sonner";
import { supabase }           from "@/integrations/supabase/client";

import { API_BASE } from "@/lib/api";
import {
  DEFAULT_INSTRUMENT,
  getInstrumentByValue,
  getInstrumentByValueOrDefault,
  SYMBOL_GROUPS,
  type Instrument,
} from "@/lib/symbolMap";

/** Normalize API error detail (FastAPI 422 returns detail as array of { msg }). */
function apiErrorMsg(detail: unknown, fallback: string): string {
  let msg: string;
  if (Array.isArray(detail)) {
    const first = (detail as { msg?: string; loc?: unknown[] }[]).map((e) => e.msg).filter(Boolean)[0];
    msg = first ?? fallback;
  } else {
    msg = typeof detail === "string" ? detail : fallback;
  }
  // Replace Pydantic's raw message with a friendly one (in case backend wasn't restarted)
  if (/string should(r)? contain at least 1 character/i.test(msg) || /at least 1 character/i.test(msg)) {
    return "Session not ready. Please refresh the page or sign in and try again.";
  }
  return msg;
}

const STARTING_CAPITAL = 1_00_000;          // ₹1,00,000
const PAPER_VERSION   = "v3";              // bump when PersistedPaper schema changes


// ─── Types ────────────────────────────────────────────────────────────────────
interface Position {
  id:            string;
  symbol:        string;
  quantity:      number;
  average_price: number;
  side:          "buy" | "sell";
}

interface OrderLogEntry {
  time:    string;
  type:    "trade" | "signal" | "system" | "error" | "info";
  action?: "buy" | "sell";
  message: string;
  pnl?:    number;
}

interface Strategy {
  id:         string;
  title:      string;
  logic_text: string;
}

interface PendingOrder {
  id:          string;
  symbol:      string;
  quantity:    number;
  side:        "buy" | "sell";
  limit_price: number;
  status:      "pending" | "filled" | "cancelled";
  created_at:  string;
}

interface DeployedBot {
  id:            string;
  bot_id:        string;
  strategyTitle: string;
  ticker:        string;
  label:         string;
  status:        "scanning" | "holding" | "stopped";
  pnl:           number;
  qty:           number;
  deployedAt:    string;
  // Greed AI fields
  healthScore?:  number;
  greedInsight?: string;
  healthStatus?: "healthy" | "warning" | "critical";
  marketState?:  string;
  volZ?:         number;
  // Advanced Greed AI
  signal?:        string;   // STRONG_BUY | BUY | HOLD | SELL | STRONG_SELL
  momentumScore?: number;   // -100 to +100
  riskFactor?:    number;   // 0 to 5
  confidence?:    number;   // 0 to 100
  changePct?:     number;   // live day change %
}

// ─── localStorage helpers ─────────────────────────────────────────────────────
interface PersistedPaper {
  version:   string;
  balance:   number;
  dayPnl:    number;
  positions: Position[];
  orderLog:  OrderLogEntry[];
  savedAt:   string;
}

const PAPER_KEY = (uid: string) => `tradeky_paper_${uid}`;

function loadPaperState(uid: string): PersistedPaper | null {
  try {
    const raw = localStorage.getItem(PAPER_KEY(uid));
    if (!raw) return null;
    const s = JSON.parse(raw) as PersistedPaper;
    // Reject old/incompatible saves — this clears the 10-lakh corruption
    if (s.version !== PAPER_VERSION) return null;
    if (typeof s.balance !== "number" || s.balance < 0 || s.balance > 50_00_000) return null;
    return s;
  } catch { return null; }
}

function savePaperState(uid: string, s: PersistedPaper) {
  try { localStorage.setItem(PAPER_KEY(uid), JSON.stringify(s)); } catch {}
}

function clearPaperState(uid: string) {
  localStorage.removeItem(PAPER_KEY(uid));
}

// ─── Misc helpers ─────────────────────────────────────────────────────────────
const DEMO_KEY = "tradeky_demo_uid";
function getDemoUserId(): string {
  let id = localStorage.getItem(DEMO_KEY);
  if (!id) { id = `demo_${Math.random().toString(36).slice(2, 10)}`; localStorage.setItem(DEMO_KEY, id); }
  return id;
}

const fmt  = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtP = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

function isNSEOpen(): boolean {
  const now = new Date();
  // IST = UTC + 5:30
  const istOffset = 5.5 * 60;
  const utcMs     = now.getTime() + now.getTimezoneOffset() * 60_000;
  const ist       = new Date(utcMs + istOffset * 60_000);
  const day       = ist.getDay(); // 0=Sun,6=Sat
  if (day === 0 || day === 6) return false;
  const h = ist.getHours(), m = ist.getMinutes();
  const mins = h * 60 + m;
  return mins >= 555 && mins < 930; // 9:15 – 15:30 IST
}

const logColor = (t: string, action?: string) => {
  if (t === "error")  return "text-loss";
  if (t === "system") return "text-yellow-400";
  if (action === "buy")  return "text-profit";
  if (action === "sell") return "text-loss";
  return "text-muted-foreground";
};

const StatusBadge = ({ status }: { status: string }) => {
  const cfg: Record<string, { variant: "default" | "secondary" | "outline"; icon: React.ReactNode }> = {
    scanning: { variant: "default",   icon: <Radio    className="w-3 h-3 animate-pulse" /> },
    holding:  { variant: "secondary", icon: <Activity className="w-3 h-3" /> },
    stopped:  { variant: "outline",   icon: <Square   className="w-3 h-3" /> },
  };
  const { variant, icon } = cfg[status] ?? cfg.scanning;
  return <Badge variant={variant} className="gap-1 capitalize text-xs">{icon}{status}</Badge>;
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function LiveTerminal() {
  // Auth
  const [userId, setUserId] = useState("");

  // Account
  const [paperBalance,       setPaperBalance]       = useState(STARTING_CAPITAL);
  const [dayPnl,             setDayPnl]             = useState(0);
  const [positions,          setPositions]          = useState<Position[]>([]);
  const [unrealizedPnl,      setUnrealizedPnl]      = useState(0);
  const [positionPrices,     setPositionPrices]     = useState<Record<string, number>>({});
  const [openPositionsCount, setOpenPositionsCount] = useState(0);
  const [accountLoading,     setAccountLoading]     = useState(true);

  // Bots / strategies
  const [deployedBots,  setDeployedBots]  = useState<DeployedBot[]>([]);
  const [selectedBot,   setSelectedBot]   = useState<DeployedBot | null>(null);
  const [strategies,    setStrategies]    = useState<Strategy[]>([]);
  const [deployStratId, setDeployStratId] = useState("");
  const [deployInstrument,  setDeployInstrument]  = useState<Instrument>(DEFAULT_INSTRUMENT);
  const [deployQty,     setDeployQty]     = useState(50);
  const [deploying,     setDeploying]     = useState(false);
  const [inlineStrategy, setInlineStrategy] = useState<{ title: string; logicText: string } | null>(null);
  const location = useLocation();

  // Chart / quote
  const [selectedInstrument, setSelectedInstrument] = useState<Instrument>(DEFAULT_INSTRUMENT);
  const [chartInterval, setChartInterval] = useState<"1m" | "5m">("5m");
  const [livePrice,     setLivePrice]   = useState<number | null>(null);
  const [liveChange,   setLiveChange]   = useState(0);
  const [quoteLoading, setQuoteLoading] = useState(false);

  // Trade execution
  const [tradeQty,     setTradeQty]     = useState(1);
  const [tradeLoading, setTradeLoading] = useState<"buy" | "sell" | null>(null);
  const [orderType,    setOrderType]    = useState<"market" | "limit">("market");
  const [limitPrice,   setLimitPrice]   = useState<string>("");

  // Pending limit orders
  const [pendingOrders,   setPendingOrders]   = useState<PendingOrder[]>([]);
  const [cancellingId,    setCancellingId]    = useState<string | null>(null);
  const [squaringOff,     setSquaringOff]     = useState(false);

  // Centre panel tab
  const [centreTab, setCentreTab] = useState<"positions" | "pending">("positions");

  // Order log
  const [orderLog, setOrderLog] = useState<OrderLogEntry[]>([]);

  // Backend
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  const logEndRef          = useRef<HTMLDivElement>(null);
  // Tracks bots that already fired a critical Greed AI alert — prevents spam
  const criticalAlertedRef = useRef<Set<string>>(new Set());

  // ── Position-level Greed AI ───────────────────────────────────────────────
  interface PositionHealth {
    score:         number;
    status:        "healthy" | "warning" | "critical";
    insight:       string;
    changePct:     number;
    signal?:       string;
    momentumScore?: number;
    riskFactor?:   number;
    confidence?:   number;
  }
  const [positionHealth,  setPositionHealth]  = useState<Record<string, PositionHealth>>({});
  const positionCriticalRef = useRef<Set<string>>(new Set());

  // ── 1. Resolve user ─────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id?.trim();
      setUserId(id && id.length > 0 ? id : getDemoUserId());
    });
  }, []);

  // ── 2. Load strategies (from backend API = saved_strategies; name→title, code→logic_text) ─
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id || cancelled) return;
      try {
        const res = await fetch(`${API_BASE}/api/strategies/mine?user_id=${encodeURIComponent(user.id)}&limit=20`);
        if (!res.ok || cancelled) return;
        const rows = await res.json();
        if (cancelled) return;
        const list: Strategy[] = (rows || []).map((r: { id: string; name?: string; code?: string }) => ({
          id: r.id,
          title: r.name ?? "",
          logic_text: r.code ?? "",
        }));
        setStrategies(list);
      } catch {
        if (!cancelled) setStrategies([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── 2b. Strategy passed from Strategy Studio (no Supabase save) ───────────────
  useEffect(() => {
    const state = location.state as {
      fromStudio?: boolean;
      fromSavedStrategy?: boolean;
      title?: string;
      logicText?: string;
      ticker?: string;
      symbolValue?: string;
    } | null;
    if ((state?.fromStudio || state?.fromSavedStrategy) && state?.logicText) {
      setInlineStrategy({ title: state.title || "Backtest strategy", logicText: state.logicText });
      const value = state.symbolValue ?? state.ticker;
      if (value) {
        const inst = getInstrumentByValueOrDefault(value);
        setSelectedInstrument(inst);
        setDeployInstrument(inst);
      }
    }
  }, [location.state]);

  // ── 3. Restore deployed bots ─────────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem("tradeky_bots");
      if (saved) {
        const bots: DeployedBot[] = JSON.parse(saved);
        setDeployedBots(bots);
        if (bots.length) {
          setSelectedBot(bots[0]);
          const inst = getInstrumentByValueOrDefault(bots[0].ticker);
          setSelectedInstrument(inst);
        }
      }
    } catch {}
  }, []);

  // ── 4. Fetch account + logs ───────────────────────────────────────────────────
  const fetchAccount = useCallback(async (uid: string) => {
    const u = (uid ?? "").trim();
    if (!u) return;
    try {
      const res = await fetch(`${API_BASE}/api/paper-trading/account?user_id=${encodeURIComponent(u)}`);
      if (res.ok) {
        const d = await res.json();
        // Only update balance/positions if backend has meaningful data.
        // If backend was freshly restarted and restore hasn't completed yet,
        // d.balance may equal STARTING_CAPITAL with 0 positions — don't clobber
        // a non-empty localStorage-loaded state in that case.
        const backendHasData = d.balance !== STARTING_CAPITAL ||
          (Array.isArray(d.positions) && d.positions.length > 0);
        if (backendHasData) {
          setPaperBalance(d.balance ?? STARTING_CAPITAL);
          setDayPnl(d.day_pnl ?? 0);
          setOpenPositionsCount(d.open_positions ?? 0);
          if (Array.isArray(d.positions)) setPositions(d.positions as Position[]);
        } else {
          // Backend returned blank slate — only update the counts, keep positions
          setOpenPositionsCount(d.open_positions ?? 0);
        }
      }
    } catch {}
    finally { setAccountLoading(false); }
  }, []);

  const fetchPendingOrders = useCallback(async (uid: string) => {
    const u = (uid ?? "").trim();
    if (!u) return;
    try {
      const res = await fetch(`${API_BASE}/api/paper-trading/pending-orders?user_id=${encodeURIComponent(u)}`);
      if (res.ok) setPendingOrders(await res.json());
    } catch {}
  }, []);

  const fetchLogs = useCallback(async (uid: string) => {
    const u = (uid ?? "").trim();
    if (!u) return;
    try {
      const res = await fetch(`${API_BASE}/api/paper-trading/logs?user_id=${encodeURIComponent(u)}&limit=500`);
      if (!res.ok) return;
      const rows: any[] = await res.json();
      const incoming: OrderLogEntry[] = rows.map(lg => ({
        time:    new Date(lg.timestamp).toLocaleTimeString("en-IN", { hour12: false }),
        type:    "trade" as const,
        action:  lg.action as "buy" | "sell",
        message: `${String(lg.action).toUpperCase()} ${lg.quantity} ${lg.symbol} @ ₹${fmt(Number(lg.price))}` +
                 (lg.realized_pnl && lg.action === "sell" ? `  P&L ${lg.realized_pnl >= 0 ? "+" : ""}₹${fmt(lg.realized_pnl)}` : ""),
        pnl:     lg.realized_pnl ?? undefined,
      }));
      // Merge with existing state — deduplicate by "time+message" key, keep all history
      setOrderLog(prev => {
        const existingKeys = new Set(prev.map(e => `${e.time}|${e.message}`));
        const fresh = incoming.filter(e => !existingKeys.has(`${e.time}|${e.message}`));
        // incoming is newest-first; prev may also be newest-first — combine and stable-sort
        return [...fresh, ...prev];
      });
    } catch {}
  }, []);

  // ── 5. Init: load localStorage → await restore → fetch backend (sequential) ──
  useEffect(() => {
    const uid = (userId ?? "").trim();
    if (!uid) return;
    let cancelled = false;

    async function init() {
      // Step A — show localStorage data immediately so UI is never blank
      const saved = loadPaperState(uid);
      if (saved) {
        setPaperBalance(saved.balance);
        setDayPnl(saved.dayPnl ?? 0);
        setPositions(saved.positions ?? []);
        if (saved.orderLog?.length) setOrderLog(saved.orderLog);

        // Step B — re-seed backend and WAIT before fetching so backend
        //           doesn't return empty state that overwrites localStorage
        try {
          await fetch(`${API_BASE}/api/paper-trading/restore`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id:   uid,
              balance:   saved.balance,
              positions: saved.positions ?? [],
              day_pnl:   saved.dayPnl ?? 0,
            }),
          });
        } catch {}
      }

      if (cancelled) return;

      // Step C — now fetch fresh data (backend is properly seeded)
      await fetchAccount(uid);
      await fetchLogs(uid);
      await fetchPendingOrders(uid);
    }

    init();

    // ── 7. Polling every 15 s (starts after init) ──
    const id = setInterval(() => {
      if (!cancelled) {
        fetchAccount(uid);
        fetchLogs(uid);
        fetchPendingOrders(uid);
      }
    }, 15_000);

    return () => { cancelled = true; clearInterval(id); };
  }, [userId, fetchAccount, fetchLogs, fetchPendingOrders]);

  // ── 6. Persist state to localStorage whenever key state changes ─────────────
  useEffect(() => {
    if (!userId || accountLoading) return;
    savePaperState(userId, {
      version: PAPER_VERSION, balance: paperBalance, dayPnl,
      positions, orderLog: orderLog.slice(0, 500), savedAt: new Date().toISOString(),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperBalance, dayPnl, positions, orderLog]);

  // ── 8. Backend health ────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_BASE}/`).then(r => setBackendOnline(r.ok)).catch(() => setBackendOnline(false));
  }, []);

  // ── 9. Live chart quote (15 s) ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      setQuoteLoading(true);
      try {
        const r = await fetch(`${API_BASE}/quote/${encodeURIComponent(selectedInstrument.value)}`);
        if (r.ok && !cancelled) {
          const d = await r.json();
          setLivePrice(d.price ?? null);
          setLiveChange(d.change_percent ?? 0);
          setBackendOnline(true);
        }
      } catch {}
      finally { if (!cancelled) setQuoteLoading(false); }
    };
    poll();
    const id = setInterval(poll, 15_000);
    return () => { cancelled = true; clearInterval(id); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInstrument.value]);

  // ── 10. Unrealized P&L — poll prices for open positions (15 s) ───────────────
  useEffect(() => {
    if (!positions.length) { setUnrealizedPnl(0); setPositionPrices({}); return; }
    let cancelled = false;
    const poll = async () => {
      const syms  = [...new Set(positions.map(p => p.symbol))];
      const prices: Record<string, number> = {};
      await Promise.all(syms.map(async sym => {
        try {
          const r = await fetch(`${API_BASE}/quote/${encodeURIComponent(sym)}`);
          if (r.ok) { const d = await r.json(); if (d.price > 0) prices[sym] = d.price; }
        } catch {}
      }));
      if (cancelled) return;
      setPositionPrices(prices);
      const pnl = positions.reduce((s, p) => {
        const cur  = prices[p.symbol] ?? p.average_price;
        const sign = p.side === "buy" ? 1 : -1;
        return s + (cur - p.average_price) * p.quantity * sign;
      }, 0);
      setUnrealizedPnl(Math.round(pnl * 100) / 100);
    };
    poll();
    const id = setInterval(poll, 15_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [positions]);

  // ── 11. Greed AI polling — every 20 s for active bots ────────────────────────
  useEffect(() => {
    if (!deployedBots.length) return;
    let cancelled = false;

    const pollGreedAI = async () => {
      const activeBots = deployedBots.filter(b => b.status === "scanning" || b.status === "holding");
      if (!activeBots.length) return;

      const updates = await Promise.all(
        activeBots.map(async bot => {
          try {
            const res = await fetch(`${API_BASE}/api/greed-ai/analyze`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                strategy_title: bot.strategyTitle,
                symbol:         bot.ticker,
                qty:            bot.qty,
                pnl:            bot.pnl,
                live_price:     positionPrices[bot.ticker] ?? livePrice ?? 0,
              }),
            });
            if (!res.ok) return null;
            const data = await res.json();
            return { bot_id: bot.bot_id, ...data };
          } catch {
            return null;
          }
        })
      );

      if (cancelled) return;

      setDeployedBots(prev => prev.map(bot => {
        const update = updates.find(u => u?.bot_id === bot.bot_id);
        if (!update) return bot;

        // ── Step 4: critical alert (fires only once per bot) ──────────────
        if (
          update.health_score < 30 &&
          !criticalAlertedRef.current.has(bot.bot_id)
        ) {
          criticalAlertedRef.current.add(bot.bot_id);
          toast.error(
            `Statistical anomaly detected: "${bot.strategyTitle}" validity dropping. Review parameters.`,
            { duration: 8000 }
          );
        }
        if (update.health_score >= 30) {
          criticalAlertedRef.current.delete(bot.bot_id);
        }

        return {
          ...bot,
          healthScore:   update.health_score,
          greedInsight:  update.insight,
          healthStatus:  update.status,
          marketState:   update.market_state,
          volZ:          update.vol_z,
          signal:        update.signal,
          momentumScore: update.momentum_score,
          riskFactor:    update.risk_factor,
          confidence:    update.confidence,
          changePct:     update.change_percent,
        };
      }));
    };

    pollGreedAI();
    const id = setInterval(pollGreedAI, 15_000);
    return () => { cancelled = true; clearInterval(id); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployedBots.length, livePrice, positionPrices]);

  // ── 12. Greed AI for open positions (manual trades) — every 25 s ─────────────
  useEffect(() => {
    if (!positions.length) { setPositionHealth({}); return; }
    let cancelled = false;

    const pollPositions = async () => {
      const results = await Promise.all(
        positions.map(async pos => {
          const pnl = ((positionPrices[pos.symbol] ?? pos.average_price) - pos.average_price)
                      * pos.quantity * (pos.side === "buy" ? 1 : -1);
          try {
            const res = await fetch(`${API_BASE}/api/greed-ai/analyze`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                strategy_title: `Manual · ${pos.symbol}`,
                symbol:         pos.symbol,
                qty:            pos.quantity,
                pnl,
                live_price:     positionPrices[pos.symbol] ?? pos.average_price,
                side:           pos.side,
              }),
            });
            if (!res.ok) return null;
            const data = await res.json();
            return { id: pos.id, symbol: pos.symbol, ...data };
          } catch { return null; }
        })
      );

      if (cancelled) return;

      const next: Record<string, PositionHealth> = {};
      for (const r of results) {
        if (!r) continue;
        next[r.id] = {
          score:         r.health_score,
          status:        r.status,
          insight:       r.insight,
          changePct:     r.change_percent ?? 0,
          signal:        r.signal,
          momentumScore: r.momentum_score,
          riskFactor:    r.risk_factor,
          confidence:    r.confidence,
        };

        // Critical alert — fires once per position, resets when recovered
        if (r.health_score < 30 && !positionCriticalRef.current.has(r.id)) {
          positionCriticalRef.current.add(r.id);
          toast.error(
            `⚠️ Greed AI: "${r.symbol}" position is critical (${r.health_score}/100). Consider closing to protect capital.`,
            { duration: 8000 }
          );
        }
        if (r.health_score >= 30) positionCriticalRef.current.delete(r.id);
      }
      setPositionHealth(next);
    };

    pollPositions();
    const id = setInterval(pollPositions, 15_000);
    return () => { cancelled = true; clearInterval(id); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions.length, positionPrices]);

  // ── 13. Smart auto-scroll — only scroll to top (newest) if user hasn't scrolled ──
  const logScrollRef = useRef<HTMLDivElement>(null);
  const userScrolledLogRef = useRef(false);

  useEffect(() => {
    const el = logScrollRef.current;
    if (!el || userScrolledLogRef.current) return;
    // newest entries are at index 0, rendered at top — scroll to top
    el.scrollTop = 0;
  }, [orderLog]);

  // ── Execute Trade ─────────────────────────────────────────────────────────────
  const executeTrade = async (side: "buy" | "sell") => {
    const uid = (userId ?? "").trim();
    if (!uid) return;
    if (backendOnline === false) {
      toast.error("Backend offline. Start: cd backend && .\\start_server.bat");
      return;
    }
    if (orderType === "limit" && (!limitPrice || Number(limitPrice) <= 0)) {
      toast.error("Enter a valid limit price before placing a limit order.");
      return;
    }
    setTradeLoading(side);
    try {
      const payload: Record<string, unknown> = {
        user_id:     uid,
        symbol:      (selectedInstrument?.value || "").trim() || DEFAULT_INSTRUMENT.value,
        quantity:    tradeQty,
        side,
        order_type:  orderType,
        strategy_id: selectedBot?.id ?? null,
      };
      if (orderType === "limit") payload.limit_price = Number(limitPrice);

      const res = await fetch(`${API_BASE}/api/paper-trading/execute`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(apiErrorMsg(err.detail, `HTTP ${res.status}`));
      }
      const data = await res.json();
      const now  = new Date().toLocaleTimeString("en-IN", { hour12: false });

      if (data.status === "pending") {
        // Limit order queued
        const msg = data.message ?? `Limit order queued: ${side.toUpperCase()} ${tradeQty} ${selectedInstrument?.label ?? selectedInstrument?.value} @ ₹${fmt(Number(limitPrice))}`;
        setOrderLog(prev => [{ time: now, type: "info", message: msg }, ...prev]);
        fetchPendingOrders(uid);
        setCentreTab("pending");
        toast.info(msg);
      } else {
        // Market order filled
        const msg = data.message ?? `${side.toUpperCase()} ${tradeQty} ${selectedInstrument?.label ?? selectedInstrument?.value} @ ₹${fmt(data.executed_price)}`;
        setOrderLog(prev => [{ time: now, type: "trade", action: side, message: msg, pnl: data.realized_pnl }, ...prev]);
        if (data.new_balance !== undefined) setPaperBalance(data.new_balance);
        if (data.new_day_pnl !== undefined) setDayPnl(data.new_day_pnl);
        fetchLogs(uid);
        fetchAccount(uid);
        const pnlNote = side === "sell" && data.realized_pnl !== undefined
          ? `  |  P&L ${data.realized_pnl >= 0 ? "+" : ""}₹${fmt(data.realized_pnl)}`
          : "";
        toast.success(`${side.toUpperCase()} filled — ${tradeQty} ${selectedInstrument?.label ?? selectedInstrument?.value} @ ₹${fmt(data.executed_price)}${pnlNote}`);
      }
    } catch (err: any) {
      const msg = err.message ?? "Trade failed";
      const now = new Date().toLocaleTimeString("en-IN", { hour12: false });
      setOrderLog(prev => [{ time: now, type: "error", message: msg }, ...prev]);
      toast.error(msg);
    } finally { setTradeLoading(null); }
  };

  // ── Close Position shortcut ───────────────────────────────────────────────────
  const closePosition = async (pos: Position) => {
    setSelectedInstrument(getInstrumentByValueOrDefault(pos.symbol));
    setTradeQty(pos.quantity);
    // Slight delay so state settles
    setTimeout(() => {
      setSelectedInstrument(getInstrumentByValueOrDefault(pos.symbol));
      setTradeQty(pos.quantity);
    }, 0);
    const uid = (userId ?? "").trim();
    if (!uid || backendOnline === false) return;
    setTradeLoading("sell");
    try {
      const res = await fetch(`${API_BASE}/api/paper-trading/execute`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: uid, symbol: (pos.symbol || "").trim(), quantity: pos.quantity, side: "sell" }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({ detail: res.statusText })); throw new Error(apiErrorMsg(e.detail, "Close failed")); }
      const data = await res.json();
      const now  = new Date().toLocaleTimeString("en-IN", { hour12: false });
      setOrderLog(prev => [{ time: now, type: "trade", action: "sell", message: data.message, pnl: data.realized_pnl }, ...prev]);
      if (data.new_balance !== undefined) setPaperBalance(data.new_balance);
      if (data.new_day_pnl !== undefined) setDayPnl(data.new_day_pnl);
      fetchAccount(uid);
      toast.success(`Position closed — ${pos.symbol}  P&L ${data.realized_pnl >= 0 ? "+" : ""}₹${fmt(data.realized_pnl)}`);
    } catch (err: any) { toast.error(err.message ?? "Close failed"); }
    finally { setTradeLoading(null); }
  };

  // ── Cancel pending limit order ────────────────────────────────────────────────
  const cancelOrder = async (orderId: string) => {
    const uid = (userId ?? "").trim();
    if (!uid) return;
    setCancellingId(orderId);
    try {
      const res = await fetch(`${API_BASE}/api/paper-trading/cancel-order`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: uid, order_id: orderId }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({ detail: res.statusText })); throw new Error(apiErrorMsg(e.detail, "Cancel failed")); }
      setPendingOrders(prev => prev.filter(o => o.id !== orderId));
      const now = new Date().toLocaleTimeString("en-IN", { hour12: false });
      setOrderLog(prev => [{ time: now, type: "system", message: `Limit order cancelled: ${orderId.slice(0, 8)}…` }, ...prev]);
      toast.warning("Limit order cancelled.");
    } catch (err: any) { toast.error(err.message ?? "Cancel failed"); }
    finally { setCancellingId(null); }
  };

  // ── Square off all positions ──────────────────────────────────────────────────
  const squareOffAll = async () => {
    const uid = (userId ?? "").trim();
    if (!uid || positions.length === 0) return;
    if (!confirm(`Square off all ${positions.length} open position(s)? This cannot be undone.`)) return;
    setSquaringOff(true);
    try {
      const res = await fetch(`${API_BASE}/api/paper-trading/square-off-all`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: uid }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({ detail: res.statusText })); throw new Error(apiErrorMsg(e.detail, "Square off failed")); }
      const data = await res.json();
      if (data.new_balance !== undefined) setPaperBalance(data.new_balance);
      if (data.new_day_pnl !== undefined) setDayPnl(data.new_day_pnl);
      fetchAccount(uid);
      fetchLogs(uid);
      const sign = (data.total_pnl ?? 0) >= 0 ? "+" : "";
      toast.success(`Square-off complete. Total P&L: ${sign}₹${fmt(data.total_pnl ?? 0)}`);
    } catch (err: any) { toast.error(err.message ?? "Square-off failed"); }
    finally { setSquaringOff(false); }
  };

  // ── Deploy Bot ────────────────────────────────────────────────────────────────
  const deployBot = async () => {
    const uid = (userId || "").trim();
    const symbol = (deployInstrument?.value || "").trim();
    if (!uid) {
      toast.error("Please sign in or refresh the page.");
      return;
    }
    if (!symbol) {
      toast.error("Please select a symbol.");
      return;
    }
    const useInline = inlineStrategy?.logicText && uid;
    const strat = useInline ? null : strategies.find(s => s.id === deployStratId);
    if (!useInline && (!strat || !uid)) return;
    if (backendOnline === false) { toast.error("Backend offline."); return; }
    setDeploying(true);
    try {
      const title = (useInline ? inlineStrategy!.title : strat!.title)?.trim() || "Strategy";
      const body = useInline
        ? {
            user_id:            uid,
            strategy_id:        "",
            symbol:             symbol,
            quantity:           deployQty,
            title,
            inline_logic_text:  (inlineStrategy!.logicText || "").trim(),
          }
        : {
            user_id:     uid,
            strategy_id: strat!.id,
            symbol:      symbol,
            quantity:    deployQty,
            title:       (strat!.title || "").trim() || "Strategy",
          };

      const res = await fetch(`${API_BASE}/api/paper-trading/deploy-bot`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(apiErrorMsg(err.detail, `HTTP ${res.status}`));
      }
      const data = await res.json();
      const bot_id = data.bot_id as string;

      const label = getInstrumentByValue(deployInstrument?.value)?.label ?? deployInstrument?.value ?? "—";
      const bot: DeployedBot = {
        id:            useInline ? "inline" : strat!.id,
        bot_id,
        strategyTitle: title,
        ticker:        deployInstrument.value,
        label,
        status:        "scanning",
        pnl:           0,
        qty:           deployQty,
        deployedAt:    new Date().toISOString(),
      };
      const updated = [bot, ...deployedBots.filter(b => b.bot_id !== bot_id)];
      setDeployedBots(updated);
      localStorage.setItem("tradeky_bots", JSON.stringify(updated));
      setSelectedBot(bot);
      setSelectedInstrument(getInstrumentByValueOrDefault(bot.ticker));

      const now = new Date().toLocaleTimeString("en-IN", { hour12: false });
      setOrderLog(prev => [{
        time: now, type: "system",
        message: `Bot deployed: "${title}" on ${label}  qty ${deployQty}  (${bot_id.slice(0, 16)}…)`,
      }, ...prev]);
      toast.success(`Bot "${title}" is live on ${label}. Checking every 60 s.`);
      if (useInline) setInlineStrategy(null);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to deploy bot");
    } finally {
      setDeploying(false);
    }
  };

  // ── Reset Account ─────────────────────────────────────────────────────────────
  const resetAccount = () => {
    const uid = (userId ?? "").trim();
    if (!uid) return;
    if (!confirm("Reset paper account to ₹1,00,000? All positions and history will be cleared.")) return;
    clearPaperState(uid);
    setPaperBalance(STARTING_CAPITAL);
    setDayPnl(0); setPositions([]); setUnrealizedPnl(0); setPositionPrices({}); setOrderLog([]); setOpenPositionsCount(0);
    fetch(`${API_BASE}/api/paper-trading/restore`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: uid, balance: STARTING_CAPITAL, positions: [], day_pnl: 0 }),
    }).catch(() => {});
    toast.success("Account reset to ₹1,00,000");
  };

  // ── Derived ───────────────────────────────────────────────────────────────────
  const investedValue  = positions.reduce((s, p) => s + p.average_price * p.quantity, 0);
  const netLiquidation = paperBalance + investedValue + unrealizedPnl;
  const totalPnl       = netLiquidation - STARTING_CAPITAL;
  const totalPnlPct    = (totalPnl / STARTING_CAPITAL) * 100;
  const chartLabel     = selectedInstrument?.label ?? selectedInstrument?.value ?? "—";
  const marketOpen     = isNSEOpen();

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <MainLayout>
      <div className="flex flex-col flex-1 overflow-hidden" style={{ minHeight: 0 }}>

        {/* Backend warning */}
        {backendOnline === false && (
          <div className="bg-loss/10 border-b border-loss/30 px-4 py-1.5 flex items-center gap-2 text-loss text-xs shrink-0">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Backend offline — start: <code className="font-mono ml-1">cd backend &amp;&amp; .\start_server.bat</code>
          </div>
        )}

        {/* ── HEADER STATS ─────────────────────────────────────────────────── */}
        <div className="border-b border-border bg-card/60 px-4 py-3 shrink-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">

            {/* Stats row */}
            <div className="flex items-center gap-5 flex-wrap">

              {/* Net Liquidation */}
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Net Liquidation</p>
                <p className={`text-xl font-bold font-data ${netLiquidation >= STARTING_CAPITAL ? "text-profit" : "text-loss"}`}>
                  {accountLoading ? <span className="text-base text-muted-foreground animate-pulse">…</span> : `₹${fmt(netLiquidation)}`}
                </p>
              </div>

              <div className="w-px h-8 bg-border" />

              {/* Available Cash */}
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Available Cash</p>
                <p className="text-xl font-bold font-data text-foreground">₹{fmt(paperBalance)}</p>
              </div>

              {/* Invested */}
              {investedValue > 0 && (
                <>
                  <div className="w-px h-8 bg-border" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Invested</p>
                    <p className="text-xl font-bold font-data text-foreground">₹{fmt(investedValue)}</p>
                  </div>
                </>
              )}

              <div className="w-px h-8 bg-border" />

              {/* Day P&L */}
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Day P&amp;L</p>
                <div className="flex items-center gap-1">
                  <p className={`text-xl font-bold font-data ${totalPnl >= 0 ? "text-profit" : "text-loss"}`}>
                    {totalPnl >= 0 ? <ArrowUpRight className="inline w-4 h-4" /> : <ArrowDownRight className="inline w-4 h-4" />}
                    {totalPnl >= 0 ? "+" : "−"}₹{fmt(Math.abs(totalPnl))}
                  </p>
                  <span className={`text-xs font-data ${totalPnl >= 0 ? "text-profit/70" : "text-loss/70"}`}>
                    ({fmtP(totalPnlPct)})
                  </span>
                </div>
                {unrealizedPnl !== 0 && (
                  <p className={`text-[10px] ${unrealizedPnl >= 0 ? "text-profit/60" : "text-loss/60"}`}>
                    Unrealized {unrealizedPnl >= 0 ? "+" : ""}₹{fmt(unrealizedPnl)}
                  </p>
                )}
              </div>

              <div className="w-px h-8 bg-border" />

              {/* Realized P&L */}
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Realized P&amp;L</p>
                <p className={`text-xl font-bold font-data ${dayPnl >= 0 ? "text-profit" : "text-loss"}`}>
                  {dayPnl >= 0 ? "+" : "−"}₹{fmt(Math.abs(dayPnl))}
                </p>
              </div>

              <div className="w-px h-8 bg-border" />

              {/* Open Positions */}
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Positions</p>
                <p className="text-xl font-bold font-data">{openPositionsCount}</p>
              </div>

              {/* Market status */}
              <Badge variant={marketOpen ? "default" : "outline"} className="gap-1 text-[10px] h-5">
                {marketOpen
                  ? <><span className="w-1.5 h-1.5 rounded-full bg-profit animate-pulse" />NSE Live</>
                  : <><span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />Market Closed</>}
              </Badge>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground"
                onClick={() => { if (userId) { fetchAccount(userId); fetchLogs(userId); } }}>
                <RefreshCw className="w-3 h-3" /> Refresh
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-loss border-loss/40 hover:bg-loss/10"
                onClick={resetAccount}>
                <RotateCcw className="w-3 h-3" /> Reset Account
              </Button>
            </div>
          </div>
        </div>

        {/* ── MAIN 3-COLUMN GRID ───────────────────────────────────────────── */}
        {/* Outer div scrolls — grid grows to full content height so every  */}
        {/* section (incl. Running Bots) is always reachable by scrolling.  */}
        <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 p-3">

          {/* ── LEFT PANEL (3 cols) ─────────────────────────────────────────── */}
          <div className="lg:col-span-3 flex flex-col gap-3">

            {/* Quick Order Form */}
            <Card className="shrink-0">
              <CardHeader className="py-2.5 px-4 border-b border-border">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <IndianRupee className="w-3 h-3 text-primary" /> Quick Order
                  {livePrice && (
                    <span className={`ml-auto font-data font-bold text-sm ${liveChange >= 0 ? "text-profit" : "text-loss"}`}>
                      ₹{fmt(livePrice)}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-2.5">
                {/* Ticker */}
                <Select value={selectedInstrument.value} onValueChange={v => { setSelectedInstrument(getInstrumentByValueOrDefault(v)); setLivePrice(null); setLiveChange(0); }}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SYMBOL_GROUPS.map((group) => (
                      <SelectGroup key={group.heading}>
                        <SelectLabel className="text-[10px] text-muted-foreground font-semibold">{group.heading}</SelectLabel>
                        {group.instruments.map((inst) => (
                          <SelectItem key={inst.value} value={inst.value} className="text-xs">{inst.label}</SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>

                {/* Market / Limit toggle */}
                <div className="flex items-center gap-1 bg-muted/40 rounded-md p-0.5">
                  <button
                    onClick={() => setOrderType("market")}
                    className={`flex-1 text-[11px] font-semibold py-1 rounded transition-colors ${orderType === "market" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                    Market
                  </button>
                  <button
                    onClick={() => setOrderType("limit")}
                    className={`flex-1 text-[11px] font-semibold py-1 rounded transition-colors ${orderType === "limit" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                    Limit
                  </button>
                </div>

                {/* Qty */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-6">Qty</span>
                  <input type="number" min={1} value={tradeQty}
                    onChange={e => setTradeQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="flex-1 bg-background border border-border rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>

                {/* Limit price (only when limit selected) */}
                {orderType === "limit" && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-6">₹</span>
                    <input
                      type="number" min={0.01} step={0.05}
                      value={limitPrice}
                      onChange={e => setLimitPrice(e.target.value)}
                      placeholder="Limit price"
                      className="flex-1 bg-background border border-primary/50 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                )}

                {/* Est. value */}
                {livePrice && (
                  <p className="text-[10px] text-muted-foreground">
                    Est. value: ₹{fmt((orderType === "limit" && Number(limitPrice) > 0 ? Number(limitPrice) : livePrice) * tradeQty)}
                    {(orderType === "limit" && Number(limitPrice) > 0 ? Number(limitPrice) : livePrice) * tradeQty > paperBalance && (
                      <span className="text-loss ml-1">(exceeds cash)</span>
                    )}
                  </p>
                )}

                {/* BUY / SELL */}
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" className="bg-profit hover:bg-profit/90 text-white border-0 font-semibold"
                    disabled={tradeLoading !== null || !userId || backendOnline === false}
                    onClick={() => executeTrade("buy")}>
                    {tradeLoading === "buy" ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : <TrendingUp className="w-3 h-3 mr-1" />}
                    BUY
                  </Button>
                  <Button size="sm" className="bg-loss hover:bg-loss/90 text-white border-0 font-semibold"
                    disabled={tradeLoading !== null || !userId || backendOnline === false}
                    onClick={() => executeTrade("sell")}>
                    {tradeLoading === "sell" ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                    SELL
                  </Button>
                </div>

                <p className="text-[10px] text-muted-foreground">
                  {orderType === "market" ? "Market order" : "Limit order — queued until filled"} · Cash: ₹{fmt(paperBalance)}
                </p>
              </CardContent>
            </Card>

            {/* Deploy Strategy */}
            <Card className="shrink-0">
              <CardHeader className="py-2.5 px-4 border-b border-border">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Rocket className="w-3 h-3 text-primary" /> Deploy Strategy
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-2">
                {inlineStrategy ? (
                  <div className="rounded-md bg-primary/10 border border-primary/30 px-2.5 py-2 text-xs text-foreground">
                    <span className="font-medium">From Strategy Studio:</span> {inlineStrategy.title}
                  </div>
                ) : (
                  <Select value={deployStratId} onValueChange={setDeployStratId}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select a strategy…" /></SelectTrigger>
                    <SelectContent>
                      {strategies.length === 0
                        ? <div className="p-3 text-xs text-muted-foreground text-center">No strategies. Create one in Strategy Studio.</div>
                        : strategies.map(s => <SelectItem key={s.id} value={s.id} className="text-xs">{s.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <Select value={deployInstrument.value} onValueChange={v => setDeployInstrument(getInstrumentByValueOrDefault(v))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SYMBOL_GROUPS.map((group) => (
                        <SelectGroup key={group.heading}>
                          <SelectLabel className="text-[10px] text-muted-foreground font-semibold">{group.heading}</SelectLabel>
                          {group.instruments.map((inst) => (
                            <SelectItem key={inst.value} value={inst.value} className="text-xs">{inst.label}</SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                  <input type="number" min={1} value={deployQty}
                    onChange={e => setDeployQty(Math.max(1, parseInt(e.target.value) || 1))}
                    placeholder="Qty"
                    className="bg-background border border-border rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>

                <Button size="sm" className="w-full h-8 text-xs" disabled={(!deployStratId && !inlineStrategy) || !userId || deploying} onClick={deployBot}>
                  {deploying ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
                  Deploy Paper Bot
                </Button>
              </CardContent>
            </Card>

            {/* Running Bots */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between shrink-0">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Bot className="w-3 h-3" /> Running Bots
                </span>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="font-data text-xs">{deployedBots.length}</Badge>
                  {deployedBots.length > 0 && (
                    <button
                      onClick={async () => {
                        // Cancel all backend workers first
                        try {
                          await fetch(`${API_BASE}/api/paper-trading/stop-all-bots`, { method: "POST" });
                        } catch {}
                        setDeployedBots([]);
                        setSelectedBot(null);
                        localStorage.removeItem("tradeky_bots");
                        toast.warning("All bots stopped.");
                      }}
                      className="text-loss/60 hover:text-loss transition-colors text-[10px]">
                      Stop all
                    </button>
                  )}
                </div>
              </div>

              {deployedBots.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center border border-dashed border-border rounded-lg gap-1">
                  <Bot className="w-6 h-6 text-muted-foreground/30 mb-1" />
                  <p className="text-xs text-muted-foreground">No bots deployed</p>
                </div>
              ) : (
                <div className="space-y-1.5 overflow-auto">
                  {deployedBots.map(bot => {
                    const isSelected = selectedBot?.id === bot.id;
                    const scoreColor =
                      bot.healthStatus === "healthy" ? "text-profit" :
                      bot.healthStatus === "warning"  ? "text-yellow-400" : "text-loss";
                    const barColor =
                      bot.healthStatus === "healthy" ? "bg-profit" :
                      bot.healthStatus === "warning"  ? "bg-yellow-500" : "bg-loss";

                    return (
                      <Card
                        key={bot.id}
                        onClick={() => {
                          setSelectedBot(isSelected ? null : bot);
                          setSelectedInstrument(getInstrumentByValueOrDefault(bot.ticker));
                        }}
                        className={`cursor-pointer transition-all duration-200 ${
                          isSelected ? "border-primary bg-primary/5 shadow-md" : "hover:border-border/80"
                        }`}
                      >
                        <CardContent className="p-3">
                          {/* ── Top row: title + controls ── */}
                          <div className="flex items-start justify-between mb-1.5">
                            <div className="min-w-0">
                              <p className="font-medium text-foreground text-xs truncate">{bot.strategyTitle}</p>
                              <p className="text-[10px] text-muted-foreground">{bot.label} · qty {bot.qty}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <StatusBadge status={bot.status} />
                              <button
                                onClick={async e => {
                                  e.stopPropagation();
                                  if (bot.bot_id) {
                                    try {
                                      await fetch(`${API_BASE}/api/paper-trading/stop-bot`, {
                                        method: "POST", headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ bot_id: bot.bot_id }),
                                      });
                                    } catch {}
                                  }
                                  const u = deployedBots.filter(b => b.bot_id !== bot.bot_id);
                                  setDeployedBots(u);
                                  localStorage.setItem("tradeky_bots", JSON.stringify(u));
                                  if (selectedBot?.bot_id === bot.bot_id) setSelectedBot(null);
                                  toast.warning(`Bot "${bot.strategyTitle}" stopped.`);
                                }}
                                className="text-muted-foreground hover:text-loss ml-1">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          {/* ── P&L row ── */}
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="text-muted-foreground">P&amp;L</span>
                            <span className={`font-data font-semibold ${bot.pnl >= 0 ? "text-profit" : "text-loss"}`}>
                              {bot.pnl >= 0 ? "+" : ""}₹{fmt(bot.pnl)}
                            </span>
                          </div>

                          {/* ── Compact Greed AI summary bar (always visible once loaded) ── */}
                          {bot.healthScore !== undefined && (() => {
                            const sigColor: Record<string, string> = {
                              STRONG_BUY:  "text-emerald-400",
                              BUY:         "text-profit",
                              HOLD:        "text-yellow-400",
                              SELL:        "text-orange-400",
                              STRONG_SELL: "text-loss",
                            };
                            const sigBg: Record<string, string> = {
                              STRONG_BUY:  "bg-emerald-500/20 border-emerald-500/40",
                              BUY:         "bg-green-500/15 border-green-500/30",
                              HOLD:        "bg-yellow-500/15 border-yellow-500/30",
                              SELL:        "bg-orange-500/15 border-orange-500/30",
                              STRONG_SELL: "bg-red-500/15 border-red-500/30",
                            };
                            const sig = bot.signal ?? "HOLD";
                            return (
                              <div className="space-y-1">
                                {/* Signal + score row */}
                                <div className="flex items-center justify-between">
                                  <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-mono font-bold tracking-widest ${sigBg[sig] ?? "bg-muted/30 border-border"} ${sigColor[sig] ?? "text-foreground"}`}>
                                    <Brain className="w-2.5 h-2.5" />
                                    {sig.replace("_", " ")}
                                  </div>
                                  <span className={`text-[9px] font-bold font-data ${scoreColor}`}>
                                    {bot.healthScore}/100
                                  </span>
                                </div>
                                {/* Bar */}
                                <div className="w-full h-1 rounded-full bg-muted/60 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                                    style={{ width: `${bot.healthScore}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })()}

                          {/* ── Diagnostics Drawer — expands when bot card is selected ── */}
                          {isSelected && bot.healthScore !== undefined && (
                            <div className="mt-3 pt-3 border-t border-border/40 animate-in fade-in slide-in-from-top-2 duration-250">

                              {/* ── Signal banner ── */}
                              {(() => {
                                const sig = bot.signal ?? "HOLD";
                                const bannerBg: Record<string,string> = {
                                  STRONG_BUY: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
                                  BUY:        "bg-green-500/10  border-green-500/25  text-green-400",
                                  HOLD:       "bg-yellow-500/10 border-yellow-500/25 text-yellow-300",
                                  SELL:       "bg-orange-500/10 border-orange-500/25 text-orange-300",
                                  STRONG_SELL:"bg-red-500/15    border-red-500/30    text-red-300",
                                };
                                const cls = bannerBg[sig] ?? "bg-muted/30 border-border text-foreground";
                                return (
                                  <div className={`flex items-center justify-between px-2 py-1 rounded-md border mb-2.5 ${cls}`}>
                                    <span className="text-[10px] font-mono font-bold tracking-widest flex items-center gap-1">
                                      <Brain className="w-3 h-3" />
                                      {sig.replace("_", " ")}
                                    </span>
                                    <span className="text-[10px] font-mono">
                                      CONF&nbsp;{bot.confidence ?? "—"}%
                                    </span>
                                  </div>
                                );
                              })()}

                              {/* ── 3-col grid: gap-4, overflow/truncate so MARKET and INSIGHT don't bleed ── */}
                              <div className="grid grid-cols-3 gap-4 mb-2.5 min-w-0">

                                {/* Col 1 — Validity */}
                                <div className="flex flex-col gap-1 min-w-0 px-2 py-1">
                                  <p className="text-[9px] text-muted-foreground/60 uppercase tracking-widest font-semibold">Validity</p>
                                  <div className="flex flex-col items-center gap-0.5">
                                    <span className={`text-xl font-bold font-data leading-none ${scoreColor}`}>
                                      {bot.healthScore}
                                    </span>
                                    <span className="text-[8px] text-muted-foreground">/ 100</span>
                                    <div className="w-full h-1.5 rounded-full bg-muted/60 overflow-hidden mt-1">
                                      <div className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                                        style={{ width: `${bot.healthScore}%` }} />
                                    </div>
                                    <span className={`text-[8px] font-bold mt-0.5 tracking-wider truncate max-w-full ${scoreColor}`}>
                                      {bot.healthStatus?.toUpperCase()}
                                    </span>
                                  </div>
                                </div>

                                {/* Col 2 — Market Metrics */}
                                <div className="flex flex-col gap-1 min-w-0 overflow-hidden px-2 py-1">
                                  <p className="text-[9px] text-muted-foreground/60 uppercase tracking-widest font-semibold">Market</p>
                                  <div className="font-mono text-[9px] space-y-1.5">
                                    <div className="flex flex-col min-w-0">
                                      <span className="text-muted-foreground/60">State</span>
                                      <span className={`font-bold truncate ${bot.marketState === "TRENDING"  ? "text-profit" :
                                        bot.marketState === "VOLATILE"  ? "text-yellow-400" :
                                                                          "text-foreground/70"
                                      }`}>{bot.marketState ?? "—"}</span>
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                      <span className="text-muted-foreground/60">Vol Z</span>
                                      <span className={`font-bold truncate ${(bot.volZ ?? 0) >= 2   ? "text-loss" :
                                        (bot.volZ ?? 0) >= 1   ? "text-yellow-400" :
                                                                  "text-profit"
                                      }`}>{bot.volZ?.toFixed(2) ?? "—"}σ</span>
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                      <span className="text-muted-foreground/60">Chg</span>
                                      <span className={`font-bold truncate ${(bot.changePct ?? 0) >= 0 ? "text-profit" : "text-loss"}`}>
                                        {bot.changePct != null ? `${bot.changePct >= 0 ? "+" : ""}${bot.changePct.toFixed(2)}%` : "—"}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Col 3 — Insight */}
                                <div className="flex flex-col gap-1 min-w-0 overflow-hidden px-2 py-1">
                                  <p className="text-[9px] text-muted-foreground/60 uppercase tracking-widest font-semibold">Insight</p>
                                  <p className="text-[9px] text-muted-foreground leading-tight break-words overflow-hidden line-clamp-4">
                                    {bot.greedInsight ?? "Awaiting market data…"}
                                  </p>
                                </div>
                              </div>

                              {/* ── Momentum + Risk bars ── */}
                              <div className="grid grid-cols-2 gap-2">

                                {/* Momentum */}
                                <div>
                                  <div className="flex justify-between mb-0.5">
                                    <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">Momentum</span>
                                    <span className={`text-[9px] font-mono font-bold ${
                                      (bot.momentumScore ?? 0) >= 0 ? "text-profit" : "text-loss"
                                    }`}>
                                      {bot.momentumScore != null ? `${bot.momentumScore >= 0 ? "+" : ""}${bot.momentumScore}` : "—"}
                                    </span>
                                  </div>
                                  {/* Bipolar bar centred at 0 */}
                                  <div className="relative w-full h-1.5 rounded-full bg-muted/60 overflow-hidden">
                                    {bot.momentumScore != null && (
                                      bot.momentumScore >= 0 ? (
                                        <div className="absolute top-0 left-1/2 h-full bg-profit rounded-full transition-all duration-700"
                                          style={{ width: `${Math.min(50, bot.momentumScore / 2)}%` }} />
                                      ) : (
                                        <div className="absolute top-0 h-full bg-loss rounded-full transition-all duration-700"
                                          style={{ right: "50%", width: `${Math.min(50, Math.abs(bot.momentumScore) / 2)}%` }} />
                                      )
                                    )}
                                    <div className="absolute top-0 left-1/2 w-px h-full bg-border/60" />
                                  </div>
                                </div>

                                {/* Risk Factor */}
                                <div>
                                  <div className="flex justify-between mb-0.5">
                                    <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">Risk</span>
                                    <span className={`text-[9px] font-mono font-bold ${
                                      (bot.riskFactor ?? 0) >= 3.5 ? "text-loss" :
                                      (bot.riskFactor ?? 0) >= 2   ? "text-yellow-400" :
                                                                      "text-profit"
                                    }`}>
                                      {bot.riskFactor != null ? `${bot.riskFactor.toFixed(1)}/5` : "—"}
                                    </span>
                                  </div>
                                  <div className="w-full h-1.5 rounded-full bg-muted/60 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all duration-700 ${
                                        (bot.riskFactor ?? 0) >= 3.5 ? "bg-loss" :
                                        (bot.riskFactor ?? 0) >= 2   ? "bg-yellow-500" : "bg-profit"
                                      }`}
                                      style={{ width: `${((bot.riskFactor ?? 0) / 5) * 100}%` }}
                                    />
                                  </div>
                                </div>

                              </div>
                            </div>
                          )}

                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── CENTRE (6 cols) ─────────────────────────────────────────────── */}
          <div className="lg:col-span-6 flex flex-col gap-3">

            {/* Chart card — fixed height so positions table always visible below */}
            <Card className="flex flex-col shrink-0" style={{ height: "340px" }}>
              <CardHeader className="py-2.5 px-4 border-b border-border shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-medium">{chartLabel}</CardTitle>
                    {/* 1m / 5m interval toggle */}
                    <div className="flex items-center rounded-md border border-border overflow-hidden">
                      {(["1m", "5m"] as const).map(iv => (
                        <button
                          key={iv}
                          onClick={() => setChartInterval(iv)}
                          className={`px-2 py-0.5 text-[10px] font-mono font-semibold transition-colors ${
                            chartInterval === iv
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                          }`}
                        >
                          {iv}
                        </button>
                      ))}
                    </div>
                    <Badge variant={marketOpen ? "default" : "outline"} className="text-[10px]">
                      {marketOpen ? "Live" : "Closed"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="font-data font-bold">
                      {livePrice ? `₹${fmt(livePrice)}` : quoteLoading ? "…" : "—"}
                    </span>
                    {liveChange !== 0 && (
                      <span className={`font-data text-xs flex items-center gap-0.5 ${liveChange >= 0 ? "text-profit" : "text-loss"}`}>
                        {liveChange >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {liveChange >= 0 ? "+" : ""}{liveChange.toFixed(2)}%
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 p-2 min-h-0 overflow-hidden">
                <TradingViewChart
                  key={`${selectedInstrument?.value ?? DEFAULT_INSTRUMENT.value}-${chartInterval}`}
                  ticker={selectedInstrument?.value ?? DEFAULT_INSTRUMENT.value}
                  interval={chartInterval}
                  pollInterval={15_000}
                  height={270}
                />
              </CardContent>
            </Card>

            {/* Positions / Pending Orders — tabbed */}
            <Card className="flex flex-col overflow-hidden" style={{ maxHeight: "420px" }}>
              {/* Tab header */}
              <CardHeader className="py-0 px-0 border-b border-border shrink-0">
                <div className="flex items-center justify-between px-2">
                  <div className="flex">
                    <button
                      onClick={() => setCentreTab("positions")}
                      className={`px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider border-b-2 transition-colors ${centreTab === "positions" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                      Open Positions
                      {positions.length > 0 && <Badge variant="outline" className="ml-1.5 font-data text-[9px] py-0">{positions.length}</Badge>}
                    </button>
                    <button
                      onClick={() => setCentreTab("pending")}
                      className={`px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider border-b-2 transition-colors ${centreTab === "pending" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                      Pending Orders
                      {pendingOrders.length > 0 && <Badge variant="outline" className="ml-1.5 font-data text-[9px] py-0">{pendingOrders.length}</Badge>}
                    </button>
                  </div>

                  {/* Square Off All — only on positions tab */}
                  {centreTab === "positions" && positions.length > 0 && (
                    <button
                      onClick={squareOffAll}
                      disabled={squaringOff}
                      className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded border border-loss/60 text-loss hover:bg-loss/10 transition-colors disabled:opacity-50 mr-1">
                      {squaringOff
                        ? <RefreshCw className="w-3 h-3 animate-spin" />
                        : <Ban className="w-3 h-3" />}
                      Square Off All
                    </button>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-0 overflow-auto flex-1">
                {/* ── Open Positions tab ── */}
                {centreTab === "positions" && (
                  positions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center gap-1.5 py-8">
                      <Activity className="w-6 h-6 text-muted-foreground/20" />
                      <p className="text-xs text-muted-foreground">No open positions</p>
                    </div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="text-left px-3 py-2 text-muted-foreground font-medium">Symbol</th>
                          <th className="text-right px-3 py-2 text-muted-foreground font-medium">Qty</th>
                          <th className="text-right px-3 py-2 text-muted-foreground font-medium">Avg Cost</th>
                          <th className="text-right px-3 py-2 text-muted-foreground font-medium">LTP</th>
                          <th className="text-right px-3 py-2 text-muted-foreground font-medium">P&amp;L</th>
                          <th className="text-right px-3 py-2 text-muted-foreground font-medium">P&amp;L %</th>
                          <th className="px-2 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {positions.map(pos => {
                          const ltp    = positionPrices[pos.symbol] ?? pos.average_price;
                          const pnl    = (ltp - pos.average_price) * pos.quantity * (pos.side === "buy" ? 1 : -1);
                          const pnlP   = ((ltp - pos.average_price) / pos.average_price) * 100 * (pos.side === "buy" ? 1 : -1);
                          const health = positionHealth[pos.id];
                          return (
                            <>
                              <tr key={pos.id} className="hover:bg-muted/20 transition-colors">
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-[9px] font-bold px-1 rounded ${pos.side === "buy" ? "bg-profit/20 text-profit" : "bg-loss/20 text-loss"}`}>
                                      {pos.side.toUpperCase()}
                                    </span>
                                    <span className="font-medium text-foreground">{pos.symbol}</span>
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-right font-data">{pos.quantity}</td>
                                <td className="px-3 py-2 text-right font-data text-muted-foreground">₹{fmt(pos.average_price)}</td>
                                <td className="px-3 py-2 text-right font-data font-medium">₹{fmt(ltp)}</td>
                                <td className={`px-3 py-2 text-right font-data font-semibold ${pnl >= 0 ? "text-profit" : "text-loss"}`}>
                                  {pnl >= 0 ? "+" : "−"}₹{fmt(Math.abs(pnl))}
                                </td>
                                <td className={`px-3 py-2 text-right font-data ${pnlP >= 0 ? "text-profit" : "text-loss"}`}>
                                  {fmtP(pnlP)}
                                </td>
                                <td className="px-2 py-2">
                                  <button onClick={() => closePosition(pos)}
                                    disabled={tradeLoading !== null}
                                    className="text-[10px] px-2 py-0.5 rounded border border-loss/40 text-loss hover:bg-loss/10 transition-colors disabled:opacity-40">
                                    Close
                                  </button>
                                </td>
                              </tr>

                              {/* ── Greed AI sub-row (advanced) ── */}
                              {health && (
                                <tr key={`${pos.id}-greed`} className="border-b border-border/20">
                                  <td colSpan={7} className="px-3 pb-2.5 pt-0">
                                    {/* Row 1: signal badge + bar + score + chg */}
                                    <div className="flex items-center gap-2 mb-0.5">
                                      {/* Signal */}
                                      {health.signal && (() => {
                                        const sigColor: Record<string,string> = {
                                          STRONG_BUY:"text-emerald-400", BUY:"text-profit",
                                          HOLD:"text-yellow-400", SELL:"text-orange-400", STRONG_SELL:"text-loss",
                                        };
                                        const sigBg: Record<string,string> = {
                                          STRONG_BUY:"bg-emerald-500/15 border-emerald-500/30",
                                          BUY:"bg-green-500/10 border-green-500/25",
                                          HOLD:"bg-yellow-500/10 border-yellow-500/25",
                                          SELL:"bg-orange-500/10 border-orange-500/25",
                                          STRONG_SELL:"bg-red-500/10 border-red-500/25",
                                        };
                                        return (
                                          <span className={`text-[8px] font-mono font-bold px-1.5 py-px rounded border shrink-0 ${sigBg[health.signal]??""} ${sigColor[health.signal]??""}`}>
                                            {health.signal.replace("_"," ")}
                                          </span>
                                        );
                                      })()}
                                      {/* Bar */}
                                      <div className="flex-1 h-1 rounded-full bg-muted/60 overflow-hidden">
                                        <div
                                          className={`h-full rounded-full transition-all duration-700 ${
                                            health.status === "healthy" ? "bg-profit" :
                                            health.status === "warning" ? "bg-yellow-500" : "bg-loss"
                                          }`}
                                          style={{ width: `${health.score}%` }}
                                        />
                                      </div>
                                      {/* Score */}
                                      <span className={`text-[9px] font-bold font-mono shrink-0 ${
                                        health.status === "healthy" ? "text-profit" :
                                        health.status === "warning" ? "text-yellow-400" : "text-loss"
                                      }`}>{health.score}/100</span>
                                      {/* Chg */}
                                      {health.changePct !== 0 && (
                                        <span className={`text-[9px] font-mono shrink-0 ${health.changePct >= 0 ? "text-profit" : "text-loss"}`}>
                                          {health.changePct >= 0 ? "▲" : "▼"}{Math.abs(health.changePct).toFixed(2)}%
                                        </span>
                                      )}
                                      {/* Confidence */}
                                      {health.confidence != null && (
                                        <span className="text-[8px] font-mono text-muted-foreground/50 shrink-0">
                                          {health.confidence}% conf
                                        </span>
                                      )}
                                    </div>
                                    {/* Row 2: momentum + risk */}
                                    {(health.momentumScore != null || health.riskFactor != null) && (
                                      <div className="flex items-center gap-3 mb-0.5">
                                        {health.momentumScore != null && (
                                          <span className={`text-[8px] font-mono ${health.momentumScore >= 0 ? "text-profit" : "text-loss"}`}>
                                            MOM {health.momentumScore >= 0 ? "+" : ""}{health.momentumScore}
                                          </span>
                                        )}
                                        {health.riskFactor != null && (
                                          <span className={`text-[8px] font-mono ${
                                            health.riskFactor >= 3.5 ? "text-loss" :
                                            health.riskFactor >= 2   ? "text-yellow-400" : "text-muted-foreground"
                                          }`}>
                                            RISK {health.riskFactor.toFixed(1)}/5
                                          </span>
                                        )}
                                      </div>
                                    )}
                                    {/* Row 3: insight */}
                                    <p className="text-[9px] text-muted-foreground/60 leading-tight">
                                      {health.insight}
                                    </p>
                                  </td>
                                </tr>
                              )}
                            </>
                          );
                        })}
                      </tbody>
                    </table>
                  )
                )}

                {/* ── Pending Orders tab ── */}
                {centreTab === "pending" && (
                  pendingOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center gap-1.5 py-8">
                      <ListOrdered className="w-6 h-6 text-muted-foreground/20" />
                      <p className="text-xs text-muted-foreground">No pending limit orders</p>
                    </div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="text-left px-3 py-2 text-muted-foreground font-medium">Symbol</th>
                          <th className="text-right px-3 py-2 text-muted-foreground font-medium">Side</th>
                          <th className="text-right px-3 py-2 text-muted-foreground font-medium">Qty</th>
                          <th className="text-right px-3 py-2 text-muted-foreground font-medium">Limit ₹</th>
                          <th className="text-right px-3 py-2 text-muted-foreground font-medium">Placed</th>
                          <th className="px-2 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingOrders.map(ord => (
                          <tr key={ord.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                            <td className="px-3 py-2 font-medium text-foreground">{ord.symbol}</td>
                            <td className="px-3 py-2 text-right">
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${ord.side === "buy" ? "bg-profit/20 text-profit" : "bg-loss/20 text-loss"}`}>
                                {ord.side.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right font-data">{ord.quantity}</td>
                            <td className="px-3 py-2 text-right font-data font-semibold">₹{fmt(ord.limit_price)}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground font-mono">
                              {new Date(ord.created_at).toLocaleTimeString("en-IN", { hour12: false })}
                            </td>
                            <td className="px-2 py-2">
                              <button
                                onClick={() => cancelOrder(ord.id)}
                                disabled={cancellingId === ord.id}
                                className="text-[10px] px-2 py-0.5 rounded border border-loss/40 text-loss hover:bg-loss/10 transition-colors disabled:opacity-40 flex items-center gap-1">
                                {cancellingId === ord.id
                                  ? <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                                  : <X className="w-2.5 h-2.5" />}
                                Cancel
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── RIGHT PANEL (3 cols) ─────────────────────────────────────────── */}
          <div className="lg:col-span-3 flex flex-col">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Zap className="w-3 h-3 text-profit" />
                Order Log
                {orderLog.length > 0 && (
                  <span className="text-[9px] font-normal text-muted-foreground/60 ml-1 normal-case tracking-normal">
                    ({orderLog.length})
                  </span>
                )}
              </span>
              <div className="flex items-center gap-2">
                {userScrolledLogRef.current && (
                  <button
                    onClick={() => {
                      userScrolledLogRef.current = false;
                      if (logScrollRef.current) logScrollRef.current.scrollTop = 0;
                    }}
                    className="text-[9px] text-primary hover:text-primary/80 transition-colors flex items-center gap-0.5"
                  >
                    ↑ Latest
                  </button>
                )}
                <button
                  onClick={() => { if (userId) { userScrolledLogRef.current = false; fetchLogs(userId); } }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
            </div>

            <Card className="overflow-hidden" style={{ height: "520px" }}>
              <CardContent className="p-0 h-full">
                {orderLog.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-4 gap-2">
                    <Zap className="w-6 h-6 text-muted-foreground/20" />
                    <p className="text-xs text-muted-foreground">No orders yet</p>
                  </div>
                ) : (
                  <div
                    ref={logScrollRef}
                    className="h-full overflow-y-auto divide-y divide-border/50"
                    onScroll={e => {
                      // Mark as user-scrolled when they go past the top 40 px
                      userScrolledLogRef.current = (e.currentTarget.scrollTop > 40);
                    }}
                  >
                    {orderLog.map((lg, i) => (
                      <div key={i} className="px-3 py-2 hover:bg-muted/20 transition-colors">
                        <div className="flex items-start gap-1.5">
                          {lg.action && (
                            <span className={`text-[9px] font-bold px-1 rounded shrink-0 mt-0.5 ${lg.action === "buy" ? "bg-profit/20 text-profit" : "bg-loss/20 text-loss"}`}>
                              {lg.action.toUpperCase()}
                            </span>
                          )}
                          <div className="min-w-0">
                            <span className="text-[10px] text-muted-foreground font-mono">[{lg.time}]</span>
                            <p className={`text-xs font-mono break-all ${logColor(lg.type, lg.action)}`}>{lg.message}</p>
                            {lg.pnl !== undefined && lg.action === "sell" && (
                              <p className={`text-[10px] font-semibold ${lg.pnl >= 0 ? "text-profit" : "text-loss"}`}>
                                Realized {lg.pnl >= 0 ? "+" : ""}₹{fmt(lg.pnl)}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

        </div>
        </div> {/* end scrollable grid wrapper */}
      </div>
    </MainLayout>
  );
}
