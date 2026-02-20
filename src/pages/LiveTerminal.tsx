import { useState, useEffect, useRef, useCallback } from "react";
import { Button }    from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge }     from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp, TrendingDown, Activity, AlertTriangle, Square,
  Radio, ArrowUpRight, ArrowDownRight, Clock, Zap, RefreshCw,
  Bot, Rocket, Plus, X, RotateCcw, IndianRupee,
} from "lucide-react";
import { MainLayout }         from "@/components/layout/MainLayout";
import { TradingViewChart }   from "@/components/charts/TradingViewChart";
import { toast }              from "sonner";
import { supabase }           from "@/integrations/supabase/client";

const API_BASE        = "http://127.0.0.1:8000";
const STARTING_CAPITAL = 1_00_000;          // ₹1,00,000
const PAPER_VERSION   = "v3";              // bump when PersistedPaper schema changes

const TICKERS = [
  { value: "NIFTY",      label: "NIFTY 50",    group: "Index"  },
  { value: "BANKNIFTY",  label: "BANK NIFTY",  group: "Index"  },
  { value: "RELIANCE",   label: "RELIANCE",     group: "Stock"  },
  { value: "HDFCBANK",   label: "HDFC BANK",    group: "Stock"  },
  { value: "TCS",        label: "TCS",          group: "Stock"  },
  { value: "INFY",       label: "INFOSYS",      group: "Stock"  },
  { value: "TATAMOTORS", label: "TATA MOTORS",  group: "Stock"  },
  { value: "SBIN",       label: "SBI",          group: "Stock"  },
  { value: "ICICIBANK",  label: "ICICI BANK",   group: "Stock"  },
  { value: "BHARTIARTL", label: "AIRTEL",       group: "Stock"  },
  { value: "WIPRO",      label: "WIPRO",        group: "Stock"  },
  { value: "MARUTI",     label: "MARUTI",       group: "Stock"  },
];

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

interface DeployedBot {
  id:            string;
  strategyTitle: string;
  ticker:        string;
  label:         string;
  status:        "scanning" | "holding" | "stopped";
  pnl:           number;
  qty:           number;
  deployedAt:    string;
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
  const [deployTicker,  setDeployTicker]  = useState("NIFTY");
  const [deployQty,     setDeployQty]     = useState(50);
  const [deploying,     setDeploying]     = useState(false);

  // Chart / quote
  const [chartTicker,  setChartTicker]  = useState("NIFTY");
  const [livePrice,    setLivePrice]    = useState<number | null>(null);
  const [liveChange,   setLiveChange]   = useState(0);
  const [quoteLoading, setQuoteLoading] = useState(false);

  // Trade execution
  const [tradeTicker,  setTradeTicker]  = useState("NIFTY");
  const [tradeQty,     setTradeQty]     = useState(1);
  const [tradeLoading, setTradeLoading] = useState<"buy" | "sell" | null>(null);

  // Order log
  const [orderLog, setOrderLog] = useState<OrderLogEntry[]>([]);

  // Backend
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  const logEndRef = useRef<HTMLDivElement>(null);

  // ── 1. Resolve user ─────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? getDemoUserId());
    });
  }, []);

  // ── 2. Load strategies ───────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from("strategies").select("id, title, logic_text")
      .order("created_at", { ascending: false }).limit(20)
      .then(({ data, error }) => { if (!error && data) setStrategies(data as Strategy[]); });
  }, []);

  // ── 3. Restore deployed bots ─────────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem("tradeky_bots");
      if (saved) {
        const bots: DeployedBot[] = JSON.parse(saved);
        setDeployedBots(bots);
        if (bots.length) { setSelectedBot(bots[0]); setChartTicker(bots[0].ticker); }
      }
    } catch {}
  }, []);

  // ── 4. Fetch account + logs ───────────────────────────────────────────────────
  const fetchAccount = useCallback(async (uid: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/paper-trading/account?user_id=${uid}`);
      if (res.ok) {
        const d = await res.json();
        setPaperBalance(d.balance ?? STARTING_CAPITAL);
        setDayPnl(d.day_pnl ?? 0);
        setOpenPositionsCount(d.open_positions ?? 0);
        if (Array.isArray(d.positions)) setPositions(d.positions as Position[]);
      }
    } catch {}
    finally { setAccountLoading(false); }
  }, []);

  const fetchLogs = useCallback(async (uid: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/paper-trading/logs?user_id=${uid}&limit=50`);
      if (res.ok) {
        const rows: any[] = await res.json();
        setOrderLog(rows.map(lg => ({
          time:    new Date(lg.timestamp).toLocaleTimeString("en-IN", { hour12: false }),
          type:    "trade" as const,
          action:  lg.action as "buy" | "sell",
          message: `${String(lg.action).toUpperCase()} ${lg.quantity} ${lg.symbol} @ ₹${fmt(Number(lg.price))}` +
                   (lg.realized_pnl && lg.action === "sell" ? `  P&L ${lg.realized_pnl >= 0 ? "+" : ""}₹${fmt(lg.realized_pnl)}` : ""),
          pnl:     lg.realized_pnl ?? undefined,
        })));
      }
    } catch {}
  }, []);

  // ── 5. Restore from localStorage + re-seed backend ────────────────────────
  useEffect(() => {
    if (!userId) return;
    const saved = loadPaperState(userId);
    if (saved) {
      setPaperBalance(saved.balance);
      setDayPnl(saved.dayPnl ?? 0);
      setPositions(saved.positions ?? []);
      if (saved.orderLog?.length) setOrderLog(saved.orderLog);
      // Re-seed backend so next trade uses the correct balance
      fetch(`${API_BASE}/api/paper-trading/restore`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, balance: saved.balance, positions: saved.positions ?? [], day_pnl: saved.dayPnl ?? 0 }),
      }).catch(() => {});
    }
  }, [userId]);

  // ── 6. Persist state to localStorage ────────────────────────────────────────
  useEffect(() => {
    if (!userId || accountLoading) return;
    savePaperState(userId, {
      version: PAPER_VERSION, balance: paperBalance, dayPnl,
      positions, orderLog: orderLog.slice(0, 100), savedAt: new Date().toISOString(),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperBalance, dayPnl, positions, orderLog]);

  // ── 7. Poll account + logs every 15 s ────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    fetchAccount(userId);
    fetchLogs(userId);
    const id = setInterval(() => { fetchAccount(userId); fetchLogs(userId); }, 15_000);
    return () => clearInterval(id);
  }, [userId, fetchAccount, fetchLogs]);

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
        const r = await fetch(`${API_BASE}/quote/${encodeURIComponent(chartTicker)}`);
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
  }, [chartTicker]);

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

  // ── 11. Auto-scroll log ───────────────────────────────────────────────────────
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [orderLog]);

  // ── Execute Trade ─────────────────────────────────────────────────────────────
  const executeTrade = async (side: "buy" | "sell") => {
    if (!userId) return;
    if (backendOnline === false) {
      toast.error("Backend offline. Start: cd backend && .\\start_server.bat");
      return;
    }
    setTradeLoading(side);
    try {
      const res = await fetch(`${API_BASE}/api/paper-trading/execute`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, symbol: tradeTicker, quantity: tradeQty, side, strategy_id: selectedBot?.id ?? null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      const now  = new Date().toLocaleTimeString("en-IN", { hour12: false });
      const msg  = data.message ?? `${side.toUpperCase()} ${tradeQty} ${tradeTicker} @ ₹${fmt(data.executed_price)}`;

      setOrderLog(prev => [{ time: now, type: "trade", action: side, message: msg, pnl: data.realized_pnl }, ...prev]);
      if (data.new_balance  !== undefined) setPaperBalance(data.new_balance);
      if (data.new_day_pnl  !== undefined) setDayPnl(data.new_day_pnl);

      fetchLogs(userId);
      fetchAccount(userId);

      const pnlNote = side === "sell" && data.realized_pnl !== undefined
        ? `  |  P&L ${data.realized_pnl >= 0 ? "+" : ""}₹${fmt(data.realized_pnl)}`
        : "";
      toast.success(`${side.toUpperCase()} filled — ${tradeQty} ${tradeTicker} @ ₹${fmt(data.executed_price)}${pnlNote}`);
    } catch (err: any) {
      const msg = err.message ?? "Trade failed";
      const now = new Date().toLocaleTimeString("en-IN", { hour12: false });
      setOrderLog(prev => [{ time: now, type: "error", message: msg }, ...prev]);
      toast.error(msg);
    } finally { setTradeLoading(null); }
  };

  // ── Close Position shortcut ───────────────────────────────────────────────────
  const closePosition = async (pos: Position) => {
    setTradeTicker(pos.symbol);
    setTradeQty(pos.quantity);
    // Slight delay so state settles
    setTimeout(() => {
      setTradeTicker(pos.symbol);
      setTradeQty(pos.quantity);
    }, 0);
    // Execute sell immediately
    if (!userId || backendOnline === false) return;
    setTradeLoading("sell");
    try {
      const res = await fetch(`${API_BASE}/api/paper-trading/execute`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, symbol: pos.symbol, quantity: pos.quantity, side: "sell" }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({ detail: res.statusText })); throw new Error(e.detail); }
      const data = await res.json();
      const now  = new Date().toLocaleTimeString("en-IN", { hour12: false });
      setOrderLog(prev => [{ time: now, type: "trade", action: "sell", message: data.message, pnl: data.realized_pnl }, ...prev]);
      if (data.new_balance !== undefined) setPaperBalance(data.new_balance);
      if (data.new_day_pnl !== undefined) setDayPnl(data.new_day_pnl);
      fetchAccount(userId);
      toast.success(`Position closed — ${pos.symbol}  P&L ${data.realized_pnl >= 0 ? "+" : ""}₹${fmt(data.realized_pnl)}`);
    } catch (err: any) { toast.error(err.message ?? "Close failed"); }
    finally { setTradeLoading(null); }
  };

  // ── Deploy Bot ────────────────────────────────────────────────────────────────
  const deployBot = () => {
    const strat = strategies.find(s => s.id === deployStratId);
    if (!strat) return;
    setDeploying(true);
    const label  = TICKERS.find(t => t.value === deployTicker)?.label ?? deployTicker;
    const bot: DeployedBot = { id: strat.id, strategyTitle: strat.title, ticker: deployTicker, label, status: "scanning", pnl: 0, qty: deployQty, deployedAt: new Date().toISOString() };
    const updated = [bot, ...deployedBots.filter(b => b.id !== bot.id)];
    setDeployedBots(updated);
    localStorage.setItem("tradeky_bots", JSON.stringify(updated));
    setSelectedBot(bot); setChartTicker(bot.ticker);
    const now = new Date().toLocaleTimeString("en-IN", { hour12: false });
    setOrderLog(prev => [{ time: now, type: "system", message: `🤖 Bot deployed: "${strat.title}" on ${label}  qty ${deployQty}` }, ...prev]);
    toast.success(`Bot deployed: ${strat.title} on ${label}`);
    setDeploying(false);
  };

  // ── Reset Account ─────────────────────────────────────────────────────────────
  const resetAccount = () => {
    if (!userId) return;
    if (!confirm("Reset paper account to ₹1,00,000? All positions and history will be cleared.")) return;
    clearPaperState(userId);
    setPaperBalance(STARTING_CAPITAL);
    setDayPnl(0); setPositions([]); setUnrealizedPnl(0); setPositionPrices({}); setOrderLog([]); setOpenPositionsCount(0);
    fetch(`${API_BASE}/api/paper-trading/restore`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, balance: STARTING_CAPITAL, positions: [], day_pnl: 0 }),
    }).catch(() => {});
    toast.success("Account reset to ₹1,00,000");
  };

  // ── Derived ───────────────────────────────────────────────────────────────────
  const investedValue  = positions.reduce((s, p) => s + p.average_price * p.quantity, 0);
  const netLiquidation = paperBalance + investedValue + unrealizedPnl;
  const totalPnl       = netLiquidation - STARTING_CAPITAL;
  const totalPnlPct    = (totalPnl / STARTING_CAPITAL) * 100;
  const chartLabel     = TICKERS.find(t => t.value === chartTicker)?.label ?? chartTicker;
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
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 p-3 overflow-hidden min-h-0">

          {/* ── LEFT PANEL (3 cols) ─────────────────────────────────────────── */}
          <div className="lg:col-span-3 flex flex-col gap-3 overflow-auto min-h-0">

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
                <Select value={tradeTicker} onValueChange={v => { setTradeTicker(v); setChartTicker(v); setLivePrice(null); setLiveChange(0); }}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <div className="text-[10px] text-muted-foreground px-2 py-1 font-semibold">INDICES</div>
                    {TICKERS.filter(t => t.group === "Index").map(t => <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>)}
                    <div className="text-[10px] text-muted-foreground px-2 py-1 font-semibold mt-1">STOCKS</div>
                    {TICKERS.filter(t => t.group === "Stock").map(t => <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>

                {/* Qty */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-6">Qty</span>
                  <input type="number" min={1} value={tradeQty}
                    onChange={e => setTradeQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="flex-1 bg-background border border-border rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>

                {/* Est. value */}
                {livePrice && (
                  <p className="text-[10px] text-muted-foreground">
                    Est. value: ₹{fmt(livePrice * tradeQty)}
                    {livePrice * tradeQty > paperBalance && (
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
                  Market order · Cash: ₹{fmt(paperBalance)}
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
                <Select value={deployStratId} onValueChange={setDeployStratId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select a strategy…" /></SelectTrigger>
                  <SelectContent>
                    {strategies.length === 0
                      ? <div className="p-3 text-xs text-muted-foreground text-center">No strategies. Create one in Strategy Studio.</div>
                      : strategies.map(s => <SelectItem key={s.id} value={s.id} className="text-xs">{s.title}</SelectItem>)}
                  </SelectContent>
                </Select>

                <div className="grid grid-cols-2 gap-2">
                  <Select value={deployTicker} onValueChange={setDeployTicker}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TICKERS.map(t => <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <input type="number" min={1} value={deployQty}
                    onChange={e => setDeployQty(Math.max(1, parseInt(e.target.value) || 1))}
                    placeholder="Qty"
                    className="bg-background border border-border rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>

                <Button size="sm" className="w-full h-8 text-xs" disabled={!deployStratId || deploying} onClick={deployBot}>
                  {deploying ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
                  Deploy Paper Bot
                </Button>
              </CardContent>
            </Card>

            {/* Running Bots */}
            <div className="flex-1 flex flex-col gap-2 overflow-auto min-h-0">
              <div className="flex items-center justify-between shrink-0">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Bot className="w-3 h-3" /> Running Bots
                </span>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="font-data text-xs">{deployedBots.length}</Badge>
                  {deployedBots.length > 0 && (
                    <button onClick={() => { setDeployedBots([]); setSelectedBot(null); localStorage.removeItem("tradeky_bots"); toast.warning("All bots stopped."); }}
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
                  {deployedBots.map(bot => (
                    <Card key={bot.id} onClick={() => { setSelectedBot(bot); setChartTicker(bot.ticker); }}
                      className={`cursor-pointer transition-all ${selectedBot?.id === bot.id ? "border-primary bg-primary/5" : "hover:border-border"}`}>
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between mb-1.5">
                          <div className="min-w-0">
                            <p className="font-medium text-foreground text-xs truncate">{bot.strategyTitle}</p>
                            <p className="text-[10px] text-muted-foreground">{bot.label} · qty {bot.qty}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <StatusBadge status={bot.status} />
                            <button onClick={e => { e.stopPropagation(); const u = deployedBots.filter(b => b.id !== bot.id); setDeployedBots(u); localStorage.setItem("tradeky_bots", JSON.stringify(u)); if (selectedBot?.id === bot.id) setSelectedBot(null); }}
                              className="text-muted-foreground hover:text-loss ml-1"><X className="w-3 h-3" /></button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">P&amp;L</span>
                          <span className={`font-data ${bot.pnl >= 0 ? "text-profit" : "text-loss"}`}>
                            {bot.pnl >= 0 ? "+" : ""}₹{fmt(bot.pnl)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── CENTRE (6 cols) ─────────────────────────────────────────────── */}
          <div className="lg:col-span-6 flex flex-col gap-3 min-h-0">

            {/* Chart card — fixed height so positions table always visible below */}
            <Card className="flex flex-col shrink-0" style={{ height: "340px" }}>
              <CardHeader className="py-2.5 px-4 border-b border-border shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-medium">{chartLabel}</CardTitle>
                    <Badge variant="secondary" className="font-mono text-[10px]">5m</Badge>
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
                <TradingViewChart key={chartTicker} ticker={chartTicker} pollInterval={15_000} height={270} />
              </CardContent>
            </Card>

            {/* Open Positions Table */}
            <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <CardHeader className="py-2.5 px-4 border-b border-border shrink-0">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Open Positions
                  {positions.length > 0 && <Badge variant="outline" className="ml-2 font-data">{positions.length}</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 flex-1 overflow-auto">
                {positions.length === 0 ? (
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
                        const ltp  = positionPrices[pos.symbol] ?? pos.average_price;
                        const pnl  = (ltp - pos.average_price) * pos.quantity * (pos.side === "buy" ? 1 : -1);
                        const pnlP = ((ltp - pos.average_price) / pos.average_price) * 100 * (pos.side === "buy" ? 1 : -1);
                        return (
                          <tr key={pos.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
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
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── RIGHT PANEL (3 cols) ─────────────────────────────────────────── */}
          <div className="lg:col-span-3 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Zap className="w-3 h-3 text-profit" /> Order Log
              </span>
              <button onClick={() => userId && fetchLogs(userId)} className="text-muted-foreground hover:text-foreground transition-colors">
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>

            <Card className="flex-1 overflow-hidden">
              <CardContent className="p-0 h-full overflow-auto">
                {orderLog.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-4 gap-2">
                    <Zap className="w-6 h-6 text-muted-foreground/20" />
                    <p className="text-xs text-muted-foreground">No orders yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/50">
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
                    <div ref={logEndRef} />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

        </div>
      </div>
    </MainLayout>
  );
}
