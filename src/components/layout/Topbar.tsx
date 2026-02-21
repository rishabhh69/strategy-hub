import { User, Crown, Bell, Menu, LogOut, CheckCheck, Inbox } from "lucide-react";
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
    navigate("/auth");
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
          {/* Upgrade Button */}
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
        </div>
      </div>
    </div>
  );
}
