import { User, Crown, Bell, Menu, LogOut, CheckCheck, Inbox, Bot, Square } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { TickerTape } from "./TickerTape";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { API_BASE } from "@/lib/api";

interface Notification {
  id:         string;
  title:      string;
  message:    string;
  is_read:    boolean;
  created_at: string;
}

interface LiveDeployment {
  deployment_id: string;
  strategy_name: string;
  symbol?: string | null;
  capital?: number | null;
  target_accounts: string;
  status: string;
  order_placed?: boolean;
  executed_at?: string | null;
  created_at?: string;
}

interface TopbarProps {
  onMenuClick?: () => void;
}

function isNSEOpen(): boolean {
  const now   = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const ist   = new Date(utcMs + 5.5 * 60 * 60_000);
  const day   = ist.getDay();
  if (day === 0 || day === 6) return false;
  const mins  = ist.getHours() * 60 + ist.getMinutes();
  return mins >= 555 && mins < 930;
}

/** Human-readable "time ago" for notification timestamps */
function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const navigate = useNavigate();

  // ── Market open/close ──────────────────────────────────────────────────────
  const [marketOpen, setMarketOpen] = useState(isNSEOpen());
  useEffect(() => {
    const id = setInterval(() => setMarketOpen(isNSEOpen()), 60_000);
    return () => clearInterval(id);
  }, []);

  // ── Auth ───────────────────────────────────────────────────────────────────
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  // ── Notifications ──────────────────────────────────────────────────────────
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [bellOpen,      setBellOpen]      = useState(false);
  const [marking,       setMarking]       = useState(false);

  const fetchNotifications = useCallback(async (uid: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/notifications?user_id=${uid}`);
      if (res.ok) setNotifications(await res.json());
    } catch {
      // Backend offline — silently skip
    }
  }, []);

  // Initial fetch + 30-second polling
  useEffect(() => {
    if (!userId) return;
    fetchNotifications(userId);
    const id = setInterval(() => fetchNotifications(userId), 30_000);
    return () => clearInterval(id);
  }, [userId, fetchNotifications]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  // ── Deployed Strategies (engine deployments modal) ───────────────────────────
  const [deployedStrategiesOpen, setDeployedStrategiesOpen] = useState(false);
  const [liveDeployments, setLiveDeployments] = useState<LiveDeployment[]>([]);
  const [deployedStrategiesLoading, setDeployedStrategiesLoading] = useState(false);
  const [stoppingId, setStoppingId] = useState<string | null>(null);

  const fetchLiveDeployments = useCallback(async (uid: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/engine/deployments?user_id=${encodeURIComponent(uid)}`);
      if (res.ok) setLiveDeployments(await res.json());
      else setLiveDeployments([]);
    } catch {
      setLiveDeployments([]);
    }
  }, []);

  useEffect(() => {
    if (deployedStrategiesOpen && userId) {
      setDeployedStrategiesLoading(true);
      fetchLiveDeployments(userId).finally(() => setDeployedStrategiesLoading(false));
    }
  }, [deployedStrategiesOpen, userId, fetchLiveDeployments]);

  // Poll deployments so green-dot indicator stays up to date
  useEffect(() => {
    if (!userId) return;
    fetchLiveDeployments(userId);
    const id = setInterval(() => fetchLiveDeployments(userId), 30_000);
    return () => clearInterval(id);
  }, [userId, fetchLiveDeployments]);

  const handleStopDeployment = async (deploymentId: string) => {
    setStoppingId(deploymentId);
    try {
      const res = await fetch(`${API_BASE}/api/engine/stop-deployment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deployment_id: deploymentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        toast.success("Deployment halted successfully.");
        if (userId) void fetchLiveDeployments(userId);
      } else {
        toast.error(data?.message || "Failed to stop deployment.");
      }
    } catch {
      toast.error("Failed to stop deployment.");
    } finally {
      setStoppingId(null);
    }
  };

  const handleMarkAllRead = async () => {
    if (!userId || unreadCount === 0) return;
    setMarking(true);
    try {
      await fetch(`${API_BASE}/api/notifications/mark-read`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ user_id: userId }),
      });
      // Optimistic update
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch {
      toast.error("Failed to mark notifications as read");
    }
    setMarking(false);
  };

  // When popover opens mark as read automatically after a short delay
  useEffect(() => {
    if (bellOpen && userId && unreadCount > 0) {
      const t = setTimeout(handleMarkAllRead, 1500);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bellOpen]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out successfully");
    navigate("/auth", { replace: true });
  };

  return (
    <div className="flex flex-col border-b border-border">
      {/* Ticker Tape */}
      <TickerTape />

      {/* Main Topbar */}
      <div className="flex items-center justify-between px-4 h-14 bg-background">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onMenuClick}
          >
            <Menu className="w-5 h-5" />
          </Button>

          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${marketOpen ? "bg-profit animate-pulse-glow" : "bg-muted-foreground"}`} />
            <span className={`text-xs font-mono ${marketOpen ? "text-profit" : "text-muted-foreground"}`}>
              {marketOpen ? "MARKETS OPEN" : "MARKET CLOSED"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Deployed Strategies — next to Upgrade to Pro */}
          <Button
            variant="ghost"
            size="sm"
            className="hidden sm:flex gap-2 relative"
            onClick={() => setDeployedStrategiesOpen(true)}
          >
            {liveDeployments.some(d => d.status === "running") && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-profit animate-pulse" />
            )}
            <Bot className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm">Deployed Strategies</span>
          </Button>

          {/* Upgrade to Pro */}
          <Button className="btn-glow bg-gradient-to-r from-primary to-accent hidden sm:flex">
            <Crown className="w-4 h-4 mr-2" />
            Upgrade to Pro
          </Button>

          {/* ── Notification Bell ────────────────────────────────────────────── */}
          <Popover open={bellOpen} onOpenChange={setBellOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <Badge
                    className="absolute -top-1 -right-1 h-4 min-w-[16px] px-[3px] text-[9px] font-bold
                               bg-loss text-white border-0 flex items-center justify-center leading-none"
                  >
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>

            <PopoverContent
              align="end"
              className="w-80 p-0 shadow-xl border border-border bg-card"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Notifications</span>
                  {unreadCount > 0 && (
                    <Badge className="h-4 px-1.5 text-[9px] bg-loss text-white border-0">
                      {unreadCount}
                    </Badge>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    disabled={marking}
                    className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/70 transition-colors disabled:opacity-50"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Mark all read
                  </button>
                )}
              </div>

              {/* Notification list */}
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                  <Inbox className="w-8 h-8 text-muted-foreground/20" />
                  <p className="text-xs text-muted-foreground">No notifications yet</p>
                </div>
              ) : (
                <ScrollArea className="max-h-[360px]">
                  <div className="divide-y divide-border/50">
                    {notifications.map(n => (
                      <div
                        key={n.id}
                        className={`px-4 py-3 transition-colors hover:bg-muted/20 ${
                          !n.is_read ? "bg-primary/[0.04]" : ""
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {/* Unread dot */}
                          <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                            !n.is_read ? "bg-primary" : "bg-transparent"
                          }`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-0.5">
                              <p className={`text-xs font-semibold leading-tight truncate ${
                                !n.is_read ? "text-foreground" : "text-foreground/70"
                              }`}>
                                {n.title}
                              </p>
                              <span className="text-[10px] text-muted-foreground/60 shrink-0 tabular-nums">
                                {timeAgo(n.created_at)}
                              </span>
                            </div>
                            {n.message && (
                              <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
                                {n.message}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}

              {/* Footer */}
              <div className="px-4 py-2.5 border-t border-border/60">
                <p className="text-[10px] text-muted-foreground/50 text-center">
                  Showing latest {notifications.length} notification{notifications.length !== 1 ? "s" : ""}
                </p>
              </div>
            </PopoverContent>
          </Popover>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-2">
                <Avatar className="w-8 h-8 border border-border">
                  <AvatarFallback className="bg-muted text-muted-foreground text-sm">
                    <User className="w-4 h-4" />
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => navigate("/profile")}>
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/settings")}>
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-loss">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Deployed Strategies Modal (all deployments, stop running) */}
          <Dialog open={deployedStrategiesOpen} onOpenChange={setDeployedStrategiesOpen}>
            <DialogContent className="sm:max-w-lg border-border bg-card max-h-[85vh] overflow-hidden flex flex-col">
              <DialogHeader className="shrink-0">
                <DialogTitle className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-primary" />
                  Deployed Strategies
                  {liveDeployments.length > 0 && (
                    <Badge variant="outline" className="ml-1 font-data text-xs">{liveDeployments.length}</Badge>
                  )}
                </DialogTitle>
                <p className="text-xs text-muted-foreground font-normal mt-1">
                  Manage all live deployments on your Angel One account.
                </p>
              </DialogHeader>

              <div className="flex-1 min-h-0 overflow-hidden">
                {deployedStrategiesLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="ml-2 text-sm text-muted-foreground">Loading…</span>
                  </div>
                ) : liveDeployments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                    <Bot className="w-8 h-8 text-muted-foreground/20" />
                    <p className="text-sm text-muted-foreground">No deployed strategies yet.</p>
                    <p className="text-xs text-muted-foreground/60">Deploy from Strategy Studio → Backtest → Deploy → Live</p>
                  </div>
                ) : (
                  <div className="overflow-y-auto max-h-[calc(85vh-10rem)] space-y-2 pr-1">
                    {liveDeployments.map((d) => {
                      const isRunning = d.status === "running";
                      const isExecuted = !!d.order_placed;
                      const statusLabel = isExecuted ? "Executed" : isRunning ? "Pending" : "Stopped";
                      const statusStyle = isExecuted
                        ? "bg-profit/15 text-profit border-profit/30"
                        : isRunning
                          ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
                          : "bg-muted/40 text-muted-foreground border-border";
                      const capitalStr = d.capital != null && !Number.isNaN(d.capital)
                        ? `₹${Number(d.capital).toLocaleString("en-IN")}`
                        : "—";

                      // Parse target accounts
                      let accountsLabel = "Personal";
                      const rawTarget = d.target_accounts;
                      if (rawTarget) {
                        let parsed: unknown = rawTarget;
                        if (typeof rawTarget === "string") {
                          try { parsed = JSON.parse(rawTarget); } catch { parsed = rawTarget; }
                        }
                        if (typeof parsed === "string") {
                          const m = (parsed as string).match(/^(\d+)\s+Client/);
                          if (m && parseInt(m[1], 10) > 1) accountsLabel = `${m[1]} Clients`;
                        } else if (parsed && typeof parsed === "object") {
                          const ta = parsed as { type?: string; client_name?: string };
                          const t = (ta.type || "").toLowerCase();
                          if (t === "all_clients" || t === "all_active_clients") accountsLabel = "All Clients";
                          else if (t === "single_client" && ta.client_name) accountsLabel = ta.client_name;
                        }
                      }

                      return (
                        <div
                          key={d.deployment_id}
                          className={`rounded-lg border p-3 transition-colors ${
                            isRunning ? "border-border bg-card" : "border-border/60 bg-muted/10 opacity-70"
                          }`}
                        >
                          {/* Row 1: Strategy name + Status badge + Stop button */}
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-2 min-w-0" style={{ maxWidth: "55%" }}>
                              <div className={`w-2 h-2 rounded-full shrink-0 ${
                                isRunning ? "bg-profit animate-pulse" : isExecuted ? "bg-profit" : "bg-muted-foreground"
                              }`} />
                              <p className="text-xs font-semibold text-foreground truncate" title={d.strategy_name || "Strategy"}>
                                {d.strategy_name || "Strategy"}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${statusStyle}`}>
                                {statusLabel}
                              </span>
                              {isRunning && (
                                <button
                                  className="flex items-center gap-0.5 px-2 py-1 rounded border border-loss/40 bg-loss/10 text-loss hover:bg-loss/25 transition-colors text-[10px] font-semibold"
                                  disabled={stoppingId === d.deployment_id}
                                  onClick={() => handleStopDeployment(d.deployment_id)}
                                >
                                  <Square className="w-2.5 h-2.5" />
                                  {stoppingId === d.deployment_id ? "Stopping…" : "Stop"}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Row 2: Compact inline metrics */}
                          <div className="flex items-center gap-3 text-[11px] flex-wrap">
                            {d.symbol && (
                              <span className="text-muted-foreground">
                                <span className="text-muted-foreground/50">Sym</span>{" "}
                                <span className="font-medium text-foreground">{d.symbol}</span>
                              </span>
                            )}
                            <span className="text-muted-foreground">
                              <span className="text-muted-foreground/50">Cap</span>{" "}
                              <span className="font-medium text-foreground font-data">{capitalStr}</span>
                            </span>
                            <span className="text-muted-foreground">
                              <span className="text-muted-foreground/50">Acct</span>{" "}
                              <span className="font-medium text-foreground">{accountsLabel}</span>
                            </span>
                          </div>

                          {/* Row 3: Execution timestamp */}
                          {isExecuted && d.executed_at && (
                            <p className="text-[10px] text-profit/70 mt-1">
                              Filled · {new Date(d.executed_at).toLocaleString("en-IN", { hour12: true, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
