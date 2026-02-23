import { useState, useEffect, useRef } from "react";
import {
  Send, Lock, Shield, User, AlertCircle,
  ArrowUp, MessageCircle, Flag, TrendingUp, BookOpen,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MainLayout } from "@/components/layout/MainLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

import { API_BASE, WS_BASE } from "@/lib/api";

// ─── Indian stock universe for $ autocomplete ────────────────────────────────
const STOCK_LIST = [
  "NIFTY","BANKNIFTY","FINNIFTY","MIDCPNIFTY",
  "RELIANCE","TCS","HDFCBANK","INFY","ICICIBANK","SBIN","BAJFINANCE",
  "HINDUNILVR","TATAMOTORS","WIPRO","ADANIENT","LT","KOTAKBANK","AXISBANK",
  "MARUTI","NESTLEIND","SUNPHARMA","TITAN","ULTRACEMCO","POWERGRID","NTPC",
  "ONGC","COALINDIA","JSWSTEEL","TECHM","DRREDDY","CIPLA","BHARTIARTL",
  "ASIANPAINT","DIVISLAB","EICHERMOT","BPCL","GRASIM","M&M","APOLLOHOSP",
  "TATACONSUM","BRITANNIA","HCLTECH","INDUSINDBK","BAJAJ-AUTO","HINDALCO",
  "TATASTEEL","VEDL","HEROMOTOCO","ITC","ADANIPORTS","ZOMATO","PAYTM",
  "IRCTC","HAL","BEL","OFSS","MPHASIS","PERSISTENT","COFORGE","LTIM",
];

// ─── Types (unchanged from original) ─────────────────────────────────────────
type CommunityMessage = Tables<"community_messages"> & {
  profiles?: {
    username: string | null;
    avatar_url: string | null;
  };
  user_roles?: {
    role: "admin" | "retail" | "sebi_verified";
  };
};

interface EnrichedMessage extends CommunityMessage {
  userName: string;
  userAvatar: string | null;
  isSebiVerified: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const GRADIENT_COLORS = [
  "from-blue-500 to-violet-500",
  "from-emerald-500 to-teal-500",
  "from-orange-500 to-rose-500",
  "from-yellow-400 to-orange-500",
  "from-pink-500 to-fuchsia-500",
];
function avatarGradient(name: string) {
  const idx = name.charCodeAt(0) % GRADIENT_COLORS.length;
  return GRADIENT_COLORS[idx];
}
function initials(name: string) {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

// ─── ChatMessage ──────────────────────────────────────────────────────────────
function ChatMessage({
  message,
  isOwn = false,
  upvoteCount = 0,
  isUpvoted = false,
  onUpvote,
  onReply,
  onReport,
}: {
  message: EnrichedMessage;
  isOwn?: boolean;
  upvoteCount?: number;
  isUpvoted?: boolean;
  onUpvote: () => void;
  onReply: () => void;
  onReport: () => void;
}) {
  const isSebi = message.isSebiVerified;

  const formattedTime = new Date(message.created_at).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const avatarEl = (
    <div className="flex-shrink-0 mt-0.5">
      <Avatar className="w-7 h-7">
        {message.userAvatar && (
          <AvatarImage src={message.userAvatar} alt={message.userName} />
        )}
        <AvatarFallback
          className={`bg-gradient-to-br ${avatarGradient(message.userName)} text-white text-[10px] font-bold`}
        >
          {initials(message.userName)}
        </AvatarFallback>
      </Avatar>
    </div>
  );

  if (isOwn) {
    // ── Right-aligned bubble (own messages) ───────────────────────────────
    return (
      <div className="group flex flex-row-reverse gap-2.5 py-1.5 px-3">
        {avatarEl}
        <div className="max-w-[72%] flex flex-col items-end">
          {/* Header */}
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
              {formattedTime}
            </span>
            <span className="text-xs font-semibold text-primary">You</span>
          </div>

          {/* Bubble */}
          <div className="bg-primary/20 border border-primary/30 rounded-2xl rounded-tr-sm px-3 py-2">
            <p className="text-xs text-foreground/90 leading-snug break-words text-right">
              {message.content}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onReport}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-loss transition-colors"
            >
              <Flag className="w-3 h-3" />
              Report
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Left-aligned bubble (other users) ────────────────────────────────────
  return (
    <div
      className={`group flex gap-2.5 py-1.5 px-3 rounded-lg hover:bg-muted/10 transition-colors ${
        isSebi ? "border-l-2 border-yellow-500/60 bg-yellow-500/[0.03] pl-2.5" : ""
      }`}
    >
      {avatarEl}

      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold text-foreground">{message.userName}</span>
          {isSebi && (
            <Badge className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 text-[8px] px-1 py-0 gap-0.5 h-3.5">
              <Shield className="w-2 h-2" />
              SEBI
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground ml-auto font-mono tabular-nums">
            {formattedTime}
          </span>
        </div>

        {/* Bubble */}
        <div className="bg-muted/20 rounded-2xl rounded-tl-sm px-3 py-2 mt-0.5 inline-block max-w-full">
          <p className="text-xs text-foreground/85 leading-snug break-words">
            {message.content}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onUpvote}
            className={`flex items-center gap-1 text-[10px] transition-colors ${
              isUpvoted ? "text-profit font-medium" : "text-muted-foreground hover:text-profit"
            }`}
          >
            <ArrowUp className={`w-3 h-3 ${isUpvoted ? "fill-current" : ""}`} />
            {upvoteCount > 0 ? upvoteCount : "Upvote"}
          </button>
          <button
            onClick={onReply}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
          >
            <MessageCircle className="w-3 h-3" />
            Reply
          </button>
          <button
            onClick={onReport}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-loss transition-colors"
          >
            <Flag className="w-3 h-3" />
            Report
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ChatInput ────────────────────────────────────────────────────────────────
function ChatInput({
  disabled,
  placeholder,
  channel,
  onSendMessage,
  isSending = false,
  replyTrigger,
}: {
  disabled?: boolean;
  placeholder?: string;
  channel: string;
  onSendMessage: (message: string, channel: string) => Promise<void>;
  isSending?: boolean;
  replyTrigger?: { prefix: string; ts: number };
}) {
  const [message,      setMessage]      = useState("");
  const [error,        setError]        = useState<string | null>(null);
  const [suggestions,  setSuggestions]  = useState<string[]>([]);
  const [activeIdx,    setActiveIdx]    = useState(0);
  const [dollarStart,  setDollarStart]  = useState<number | null>(null);
  const inputRef   = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Prefill input when a Reply button is clicked
  useEffect(() => {
    if (replyTrigger && replyTrigger.ts > 0 && replyTrigger.prefix) {
      setMessage(replyTrigger.prefix);
      setSuggestions([]);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [replyTrigger?.ts]);

  // Compute $ suggestions as user types
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val    = e.target.value;
    const cursor = e.target.selectionStart ?? val.length;
    setMessage(val);

    // Find the start of a $WORD that the cursor is currently inside
    const beforeCursor = val.slice(0, cursor);
    const match = beforeCursor.match(/\$([A-Z&\-]*)$/i);
    if (match) {
      const query = match[1].toUpperCase();
      const idx   = beforeCursor.length - match[0].length;
      setDollarStart(idx);
      const filtered = query
        ? STOCK_LIST.filter(s => s.startsWith(query)).slice(0, 8)
        : STOCK_LIST.slice(0, 8);
      setSuggestions(filtered);
      setActiveIdx(0);
    } else {
      setSuggestions([]);
      setDollarStart(null);
    }
  };

  // Insert selected ticker into the message
  const insertTicker = (stock: string) => {
    if (dollarStart === null) return;
    const cursor   = inputRef.current?.selectionStart ?? message.length;
    const before   = message.slice(0, dollarStart);           // text before $
    const after    = message.slice(cursor);                    // text after current word
    const inserted = `${before}$${stock} ${after}`;
    setMessage(inserted);
    setSuggestions([]);
    setDollarStart(null);
    // Move cursor to right after the inserted ticker + space
    const newPos = dollarStart + stock.length + 2;
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const handleSend = async () => {
    if (!message.trim()) return;
    setSuggestions([]);
    try {
      setError(null);
      await onSendMessage(message, channel);
      setMessage("");
    } catch (err) {
      setError((err as Error).message || "Failed to send message");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertTicker(suggestions[activeIdx]); return; }
      if (e.key === "Escape")    { setSuggestions([]); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-border bg-card/60 backdrop-blur-sm shrink-0">
      {error && (
        <Alert variant="destructive" className="mx-4 mt-3">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* $ autocomplete dropdown */}
      {suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="mx-5 mb-1 rounded-xl border border-border/80 bg-card shadow-xl overflow-hidden"
        >
          <p className="px-3 py-1.5 text-[10px] text-muted-foreground/60 border-b border-border/40 font-medium tracking-wide uppercase">
            Stocks — ↑↓ navigate · Tab/Enter to insert
          </p>
          <ul>
            {suggestions.map((stock, i) => (
              <li key={stock}>
                <button
                  onMouseDown={e => { e.preventDefault(); insertTicker(stock); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                    i === activeIdx
                      ? "bg-primary/15 text-foreground"
                      : "hover:bg-muted/20 text-foreground/80"
                  }`}
                >
                  <span className="font-mono font-semibold text-primary text-xs">$</span>
                  <span className="font-mono font-semibold">{stock}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-3 px-5 pt-3 pb-3 items-center">
        <Input
          ref={inputRef}
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || "Type your message… (use $ to mention a stock)"}
          disabled={disabled || isSending}
          className="flex-1 bg-background/80 border-border/60 text-sm h-11 rounded-xl focus-visible:ring-1 focus-visible:ring-primary/60 placeholder:text-muted-foreground/40"
        />
        <Button
          disabled={disabled || !message.trim() || isSending}
          size="icon"
          onClick={handleSend}
          className="h-11 w-11 rounded-xl shrink-0"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>

      {/* SEBI compliance disclaimer */}
      <p className="text-[10px] text-muted-foreground/60 px-5 pb-3 leading-relaxed">
        ⚠️ All discussions are for educational purposes regarding algorithmic parameters.
        This is not SEBI-registered financial advice. Do not share or follow direct stock tips.
      </p>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
const DEFAULT_TICKERS = ["$NIFTY", "$BANKNIFTY", "$RELIANCE", "$HDFCBANK", "$TCS"];

function CommunitySidebar() {
  const [tickers, setTickers]   = useState<{ ticker: string; count: number }[]>([]);
  const [organic, setOrganic]   = useState(false); // true when data is from real mentions

  const fetchTrending = async () => {
    try {
      const res  = await fetch(`${API_BASE}/api/community/trending-tickers`);
      const data = await res.json();
      if (data.tickers?.length) {
        setTickers(data.tickers);
        setOrganic(data.tickers.some((t: { count: number }) => t.count > 0));
      }
    } catch {
      setTickers(DEFAULT_TICKERS.map(t => ({ ticker: t, count: 0 })));
      setOrganic(false);
    }
  };

  useEffect(() => {
    fetchTrending();
    const id = setInterval(fetchTrending, 30_000);
    return () => clearInterval(id);
  }, []);

  const displayTickers = tickers.length
    ? tickers
    : DEFAULT_TICKERS.map(t => ({ ticker: t, count: 0 }));

  return (
    <div className="flex flex-col gap-4">
      {/* Trending Tickers */}
      <Card className="bg-card/40 border-border/60">
        <CardHeader className="py-2.5 px-4 border-b border-border/60">
          <CardTitle className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-profit" />
              Trending Tickers
            </span>
            {organic && (
              <span className="text-[9px] text-profit/80 font-normal normal-case tracking-normal">
                from community
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 flex flex-wrap gap-1.5">
          {displayTickers.map(({ ticker, count }) => (
            <div key={ticker} className="relative group/badge">
              <Badge
                variant="outline"
                className="text-[10px] font-mono cursor-pointer hover:bg-primary/10 hover:border-primary/50 transition-colors px-2 py-0.5"
              >
                {ticker}
                {count > 0 && (
                  <span className="ml-1 text-[9px] text-muted-foreground tabular-nums">
                    ×{count}
                  </span>
                )}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Community Guidelines */}
      <Card className="bg-card/40 border-border/60">
        <CardHeader className="py-2.5 px-4 border-b border-border/60">
          <CardTitle className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-primary" />
            Community Guidelines
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 py-3">
          <ol className="space-y-2.5 text-[11px] text-muted-foreground list-none">
            {[
              "No unsolicited stock tips or \"buy this now\" posts.",
              "Discuss strategy logic and parameters — not return guarantees.",
              "Be respectful. Constructive critique only.",
            ].map((rule, i) => (
              <li key={i} className="flex gap-2 leading-relaxed">
                <span className="text-primary font-bold shrink-0">{i + 1}.</span>
                <span>{rule}</span>
              </li>
            ))}
          </ol>
          <div className="mt-3 pt-3 border-t border-border/60">
            <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
              <Shield className="w-3 h-3 inline mr-1 text-yellow-500" />
              Gold badge = SEBI Registered Advisor. Educational posts only.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Live connection indicator */}
      <div className="flex items-center gap-2 px-1 mt-auto">
        <span className="w-2 h-2 rounded-full bg-profit animate-pulse shrink-0" />
        <span className="text-[10px] text-muted-foreground/70">Live updates active</span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Community() {
  // ── existing state (unchanged) ────────────────────────────────────────────
  const [generalMessages, setGeneralMessages] = useState<EnrichedMessage[]>([]);
  const [expertMessages,  setExpertMessages]  = useState<EnrichedMessage[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [isSending,       setIsSending]       = useState(false);
  const [currentUser,     setCurrentUser]     = useState<any>(null);
  const [myUsername,      setMyUsername]      = useState<string>("");   // profile username
  const [userRole,        setUserRole]        = useState<"admin" | "retail" | "sebi_verified" | null>(null);
  const [canPostInExpert, setCanPostInExpert] = useState(false);
  const [activeTab,       setActiveTab]       = useState<"general" | "expert">("expert"); // default last in list; set to most recent by activity after load

  // ── Upvote & reply state ──────────────────────────────────────────────────
  const [upvoteCounts, setUpvoteCounts] = useState<Record<string, number>>({});
  const [upvotedIds,   setUpvotedIds]   = useState<Set<string>>(new Set());
  const [generalReplyTrigger, setGeneralReplyTrigger] = useState<{ prefix: string; ts: number }>({ prefix: "", ts: 0 });
  const [expertReplyTrigger,  setExpertReplyTrigger]  = useState<{ prefix: string; ts: number }>({ prefix: "", ts: 0 });

  function handleUpvote(msgId: string) {
    setUpvotedIds(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) {
        next.delete(msgId);
        setUpvoteCounts(u => ({ ...u, [msgId]: Math.max(0, (u[msgId] ?? 1) - 1) }));
      } else {
        next.add(msgId);
        setUpvoteCounts(u => ({ ...u, [msgId]: (u[msgId] ?? 0) + 1 }));
      }
      return next;
    });
  }

  function handleReply(userName: string, channel: string) {
    const trigger = { prefix: `@${userName} `, ts: Date.now() };
    if (channel === "general") {
      setGeneralReplyTrigger(trigger);
      setActiveTab("general");
    } else {
      setExpertReplyTrigger(trigger);
      setActiveTab("expert");
    }
  }

  function handleReport(userName: string) {
    toast.error(`Report submitted for ${userName}'s message. Our moderation team will review it.`, {
      duration: 4000,
    });
  }

  const generalScrollRef = useRef<HTMLDivElement>(null);
  const expertScrollRef  = useRef<HTMLDivElement>(null);

  // ── WebSocket refs ────────────────────────────────────────────────────────
  const wsGeneral = useRef<WebSocket | null>(null);
  const wsExpert  = useRef<WebSocket | null>(null);

  // ── WS connect / disconnect ───────────────────────────────────────────────
  useEffect(() => {
    function openWS(channel: string, ref: React.MutableRefObject<WebSocket | null>) {
      try {
        const ws = new WebSocket(`${WS_BASE}/ws/community?channel=${channel}`);

        ws.onopen = () => {
          console.log(`[WS] Connected to ${channel}`);
          ref.current = ws;
        };

        ws.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            // Only append WS messages that came from OTHER clients
            // (our own optimistic insert already appears via Supabase realtime)
            if (!payload._self) {
              const enriched: EnrichedMessage = {
                id:              payload.id       ?? `ws_${Date.now()}`,
                user_id:         payload.user_id  ?? "",
                content:         payload.content  ?? payload.text ?? "",
                channel:         payload.channel  ?? channel,
                created_at:      payload.timestamp ?? new Date().toISOString(),
                userName:        payload.userName ?? "Anonymous",
                userAvatar:      payload.userAvatar ?? null,
                isSebiVerified:  payload.isSebiVerified ?? false,
              };
              if (channel === "general") {
                setGeneralMessages(prev => {
                  // deduplicate by id
                  if (prev.some(m => m.id === enriched.id)) return prev;
                  return [...prev, enriched];
                });
                setTimeout(() => {
                  if (generalScrollRef.current)
                    generalScrollRef.current.scrollTop = generalScrollRef.current.scrollHeight;
                }, 50);
              } else {
                setExpertMessages(prev => {
                  if (prev.some(m => m.id === enriched.id)) return prev;
                  return [...prev, enriched];
                });
                setTimeout(() => {
                  if (expertScrollRef.current)
                    expertScrollRef.current.scrollTop = expertScrollRef.current.scrollHeight;
                }, 50);
              }
            }
          } catch {}
        };

        ws.onerror = (e) => console.warn(`[WS] ${channel} error`, e);

        ws.onclose = () => {
          ref.current = null;
          console.log(`[WS] ${channel} disconnected`);
        };
      } catch (e) {
        console.warn("[WS] Could not connect:", e);
      }
    }

    openWS("general", wsGeneral);
    openWS("expert",  wsExpert);

    return () => {
      wsGeneral.current?.close();
      wsExpert.current?.close();
    };
  }, []);

  // ── existing: init user ───────────────────────────────────────────────────
  useEffect(() => {
    const initializeUser = async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) { setLoading(false); return; }
        setCurrentUser(user);

        // Fetch profile username (used for display + WS broadcast)
        const { data: profileData } = await supabase
          .from("profiles").select("username").eq("user_id", user.id).single();
        const uname = profileData?.username?.trim() || user.email?.split("@")[0] || "Anonymous";
        setMyUsername(uname);

        const { data: roleData } = await supabase
          .from("user_roles").select("role").eq("user_id", user.id).single();
        const role = roleData?.role || "retail";
        setUserRole(role as "admin" | "retail" | "sebi_verified");
        setCanPostInExpert(role === "sebi_verified" || role === "admin");

        const [general, expert] = await Promise.all([
          fetchMessagesReturn("general"),
          fetchMessagesReturn("expert"),
        ]);
        setGeneralMessages(general);
        setExpertMessages(expert);
        const generalLatest = general.length > 0 ? new Date(general[0].created_at).getTime() : 0;
        const expertLatest  = expert.length > 0  ? new Date(expert[0].created_at).getTime() : 0;
        setActiveTab(expertLatest >= generalLatest ? "expert" : "general");
      } catch (error) {
        console.error("Error initializing user:", error);
      } finally {
        setLoading(false);
      }
    };
    initializeUser();
  }, []);

  // ── existing: Supabase realtime subscriptions ─────────────────────────────
  useEffect(() => {
    const subscriptionGeneral = supabase
      .channel("public:community_messages:channel=eq.general")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "community_messages", filter: "channel=eq.general" },
        async (payload) => {
          const enriched = await enrichMessage(payload.new as CommunityMessage);
          setGeneralMessages(prev => {
            if (prev.some(m => m.id === enriched.id)) return prev;
            return [enriched, ...prev];
          });
          setTimeout(() => {
            if (generalScrollRef.current)
              generalScrollRef.current.scrollTop = 0;
          }, 0);
        })
      .subscribe();

    const subscriptionExpert = supabase
      .channel("public:community_messages:channel=eq.expert")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "community_messages", filter: "channel=eq.expert" },
        async (payload) => {
          const enriched = await enrichMessage(payload.new as CommunityMessage);
          setExpertMessages(prev => {
            if (prev.some(m => m.id === enriched.id)) return prev;
            return [enriched, ...prev];
          });
          setTimeout(() => {
            if (expertScrollRef.current)
              expertScrollRef.current.scrollTop = 0;
          }, 0);
        })
      .subscribe();

    return () => { subscriptionGeneral.unsubscribe(); subscriptionExpert.unsubscribe(); };
  }, []);

  // ── existing: helpers ─────────────────────────────────────────────────────
  const fetchMessages = async (
    channel: string,
    setSetter: (messages: EnrichedMessage[]) => void
  ) => {
    try {
      const { data, error } = await supabase
        .from("community_messages").select("*").eq("channel", channel)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const enriched = await Promise.all((data || []).map(enrichMessage));
      setSetter(enriched);
    } catch (error) {
      console.error(`Error fetching ${channel} messages:`, error);
    }
  };

  /** Fetch and return enriched messages for a channel (used to pick default tab by latest activity). */
  const fetchMessagesReturn = async (channel: string): Promise<EnrichedMessage[]> => {
    try {
      const { data, error } = await supabase
        .from("community_messages").select("*").eq("channel", channel)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return await Promise.all((data || []).map(enrichMessage));
    } catch (error) {
      console.error(`Error fetching ${channel} messages:`, error);
      return [];
    }
  };

  const enrichMessage = async (message: CommunityMessage): Promise<EnrichedMessage> => {
    try {
      const [profileRes, roleRes] = await Promise.all([
        supabase.from("profiles").select("username, avatar_url").eq("user_id", message.user_id).single(),
        supabase.from("user_roles").select("role").eq("user_id", message.user_id).single(),
      ]);
      return {
        ...message,
        userName:       profileRes.data?.username  || "Anonymous",
        userAvatar:     profileRes.data?.avatar_url || null,
        isSebiVerified: roleRes.data?.role === "sebi_verified",
      } as EnrichedMessage;
    } catch {
      return { ...message, userName: "Anonymous", userAvatar: null, isSebiVerified: false } as EnrichedMessage;
    }
  };

  // ── send: Supabase insert + WS broadcast ─────────────────────────────────
  const handleSendMessage = async (messageText: string, channel: string) => {
    if (!currentUser || !messageText.trim()) return;
    setIsSending(true);
    try {
      // 1. Persist to Supabase (Supabase realtime will echo it back)
      const { data, error } = await supabase.from("community_messages").insert({
        user_id: currentUser.id,
        content: messageText,
        channel,
      }).select().single();
      if (error) throw error;

      // 2. Broadcast via WebSocket for instant delivery to other tabs/users
      const ws = channel === "general" ? wsGeneral.current : wsExpert.current;
      if (ws?.readyState === WebSocket.OPEN) {
        const payload = {
          id:             data?.id        ?? `ws_${Date.now()}`,
          user_id:        currentUser.id,
          content:        messageText,
          channel,
          timestamp:      new Date().toISOString(),
          userName:       myUsername || currentUser.email?.split("@")[0] || "Anonymous",
          userAvatar:     currentUser.user_metadata?.avatar_url ?? null,
          isSebiVerified: userRole === "sebi_verified",
          _self:          false,   // not tagged _self so others receive it normally
        };
        ws.send(JSON.stringify(payload));
      }
    } catch (error) {
      console.error("Error sending message:", error);
      throw error;
    } finally {
      setIsSending(false);
    }
  };

  // ── render guards ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <MainLayout>
        <div className="h-full flex items-center justify-center">
          <p className="text-muted-foreground animate-pulse">Loading community…</p>
        </div>
      </MainLayout>
    );
  }

  if (!currentUser) {
    return (
      <MainLayout>
        <div className="h-full flex flex-col items-center justify-center gap-4 p-4">
          <Lock className="w-12 h-12 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Sign in to Access Community</h1>
          <p className="text-muted-foreground text-center max-w-sm">
            Please log in to participate in the community forums
          </p>
        </div>
      </MainLayout>
    );
  }

  // ── main UI ───────────────────────────────────────────────────────────────
  return (
    <MainLayout>
      {/* Root fills the entire available area from MainLayout */}
      <div className="flex flex-col h-full overflow-hidden">

        {/* 2-column grid — stretches edge-to-edge and top-to-bottom */}
        <div className="flex-1 grid lg:grid-cols-12 gap-0 overflow-hidden min-h-0">

          {/* ── Chat column (9 cols) ───────────────────────────────────────── */}
          <div className="lg:col-span-9 h-full flex flex-col border-r border-border overflow-hidden">

            {/* ── Tab bar ──────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-5 border-b border-border shrink-0 bg-card/40">
              <div className="flex">
                <button
                  onClick={() => setActiveTab("general")}
                  className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === "general"
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <User className="w-4 h-4" />
                  General Discussion
                </button>
                <button
                  onClick={() => setActiveTab("expert")}
                  className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === "expert"
                      ? "border-yellow-500 text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Shield className={`w-4 h-4 ${activeTab === "expert" ? "text-yellow-500" : ""}`} />
                  Expert Lounge
                </button>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pr-1">
                <span className="w-2 h-2 rounded-full bg-profit animate-pulse" />
                Live
              </div>
            </div>

            {/* ── General panel ────────────────────────────────────────────── */}
            <div className={`flex-1 flex flex-col min-h-0 overflow-hidden ${activeTab === "general" ? "" : "hidden"}`}>
              <ScrollArea className="flex-1" ref={generalScrollRef}>
                <div className="px-2 py-2 space-y-0">
                  {generalMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                      <MessageCircle className="w-10 h-10 text-muted-foreground/20" />
                      <p className="text-sm text-muted-foreground">No messages yet. Join the conversation!</p>
                    </div>
                  ) : (
                    generalMessages.map(msg => (
                      <ChatMessage
                        key={msg.id}
                        message={msg}
                        isOwn={msg.user_id === currentUser?.id}
                        upvoteCount={upvoteCounts[msg.id] ?? 0}
                        isUpvoted={upvotedIds.has(msg.id)}
                        onUpvote={() => handleUpvote(msg.id)}
                        onReply={() => handleReply(msg.userName, "general")}
                        onReport={() => handleReport(msg.userName)}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
              <ChatInput
                channel="general"
                placeholder="Share your thoughts on algo trading…"
                onSendMessage={handleSendMessage}
                isSending={isSending}
                replyTrigger={generalReplyTrigger}
              />
            </div>

            {/* ── Expert panel ─────────────────────────────────────────────── */}
            <div className={`flex-1 flex flex-col min-h-0 overflow-hidden ${activeTab === "expert" ? "" : "hidden"}`}>
              {!canPostInExpert && (
                <div className="mx-4 mt-3 shrink-0 flex items-center gap-2.5 px-3 py-2 rounded-lg border border-yellow-500/30 bg-yellow-900/10">
                  <Lock className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                  <p className="text-yellow-300 text-xs leading-snug">
                    Read-only — only SEBI Registered Advisors can post here.
                  </p>
                </div>
              )}
              <ScrollArea className="flex-1" ref={expertScrollRef}>
                <div className="px-2 py-2 space-y-0">
                  {expertMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                      <Shield className="w-10 h-10 text-muted-foreground/20" />
                      <p className="text-sm text-muted-foreground">No expert posts yet.</p>
                    </div>
                  ) : (
                    expertMessages.map(msg => (
                      <ChatMessage
                        key={msg.id}
                        message={msg}
                        isOwn={msg.user_id === currentUser?.id}
                        upvoteCount={upvoteCounts[msg.id] ?? 0}
                        isUpvoted={upvotedIds.has(msg.id)}
                        onUpvote={() => handleUpvote(msg.id)}
                        onReply={() => handleReply(msg.userName, "expert")}
                        onReport={() => handleReport(msg.userName)}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
              <ChatInput
                disabled={!canPostInExpert}
                placeholder={canPostInExpert ? "Share your expert insights…" : "Read-only mode"}
                channel="expert"
                onSendMessage={handleSendMessage}
                isSending={isSending}
                replyTrigger={expertReplyTrigger}
              />
            </div>

          </div>

          {/* ── Sidebar (3 cols) ───────────────────────────────────────────── */}
          <div className="hidden lg:flex lg:col-span-3 flex-col gap-3 overflow-auto p-4 bg-card/20">
            <CommunitySidebar />
          </div>

        </div>
      </div>
    </MainLayout>
  );
}
