import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  User, Bell, Shield, CreditCard, LogOut,
  CheckCircle2, XCircle, Loader2, Lock, Clock, PlugZap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { API_BASE } from "@/lib/api";
const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;
const COOLDOWN_DAYS = 14;

/** Days remaining in username-change cooldown, or 0 if unlocked. */
function cooldownRemaining(changedAt: string | null): number {
  if (!changedAt) return 0;
  const ms      = Date.now() - new Date(changedAt).getTime();
  const elapsed = ms / (1000 * 60 * 60 * 24);
  const left    = COOLDOWN_DAYS - elapsed;
  return left > 0 ? Math.ceil(left) : 0;
}

/** localStorage helpers — persist cooldown even when DB column doesn't exist yet */
function lsKey(uid: string) { return `tradeky_username_changed_at_${uid}`; }
function lsGetChangedAt(uid: string): string | null { return localStorage.getItem(lsKey(uid)); }
function lsSetChangedAt(uid: string, iso: string)   { localStorage.setItem(lsKey(uid), iso); }
function lsClearChangedAt(uid: string)               { localStorage.removeItem(lsKey(uid)); }

export default function Settings() {
  const [userId,            setUserId]            = useState("");
  const [username,          setUsername]          = useState("");
  const [email,             setEmail]             = useState("");
  const [strategyAlerts,    setStrategyAlerts]    = useState(true);
  const [marketUpdates,     setMarketUpdates]     = useState(true);
  const [communityMentions, setCommunityMentions] = useState(true);
  const [loading,           setLoading]           = useState(true);
  const [saving,            setSaving]            = useState(false);

  // Username change tracking
  const [originalUsername,    setOriginalUsername]    = useState("");
  const [usernameChangedAt,   setUsernameChangedAt]   = useState<string | null>(null);
  const [cooldownLeft,        setCooldownLeft]        = useState(0);  // days

  // Real-time availability state
  const [usernameStatus, setUsernameStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid"
  >("idle");
  const [usernameHint, setUsernameHint] = useState("");

  // Broker connection (Angel One) — so any user can connect and execute from Strategy Studio
  const [brokerConnected, setBrokerConnected] = useState<{ broker: string; client_id: string | null } | null>(null);
  const [brokerClientId, setBrokerClientId] = useState("");
  const [brokerPin, setBrokerPin] = useState("");
  const [brokerTotpSecret, setBrokerTotpSecret] = useState("");
  const [brokerLinking, setBrokerLinking] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate    = useNavigate();

  // ── Load profile ──────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/auth", { replace: true }); return; }

      setUserId(user.id);
      setEmail(user.email ?? "");

      let uname = "";
      let dbChangedAt: string | null = null;
      let prefsLoaded = false;

      // Prefer backend so cooldown (username_changed_at) is consistent across devices.
      try {
        const res = await fetch(
          `${API_BASE}/api/user/profile?user_id=${encodeURIComponent(user.id)}`
        );
        if (res.ok) {
          const data = await res.json();
          uname = (data.username ?? "").trim();
          setStrategyAlerts(data.strategy_alerts ?? true);
          setMarketUpdates(data.market_updates ?? true);
          setCommunityMentions(data.community_mentions ?? true);
          dbChangedAt = data.username_changed_at ?? null;
          prefsLoaded = true;
        }
      } catch {
        // Backend down — fall back to Supabase
      }

      if (!prefsLoaded) {
        // Step 1: Fetch guaranteed columns from Supabase
        const { data: coreProfile } = await supabase
          .from("profiles")
          .select("username, updated_at")
          .eq("user_id", user.id)
          .single();

        uname = coreProfile?.username?.trim() ?? "";

        // Step 2: Optional columns (may not exist yet)
        try {
          const { data: extProfile, error: extErr } = await supabase
            .from("profiles")
            .select("strategy_alerts, market_updates, community_mentions, username_changed_at")
            .eq("user_id", user.id)
            .single();

          if (!extErr && extProfile) {
            const ext = extProfile as { strategy_alerts?: boolean; market_updates?: boolean; community_mentions?: boolean; username_changed_at?: string | null };
            setStrategyAlerts(ext.strategy_alerts ?? true);
            setMarketUpdates(ext.market_updates ?? true);
            setCommunityMentions(ext.community_mentions ?? true);
            dbChangedAt = ext.username_changed_at ?? null;
          }
        } catch {
          // ignore
        }
      }

      // Seed username from sign-up metadata if profile never got it (e.g. confirm on another device).
      if (!uname && (user.user_metadata?.username ?? "").trim()) {
        const metaUname = (user.user_metadata.username as string).trim();
        uname = metaUname;
        try {
          await supabase
            .from("profiles")
            .update({ username: metaUname })
            .eq("user_id", user.id);
        } catch {
          // best-effort
        }
      }

      setUsername(uname);
      setOriginalUsername(uname);

      const localChangedAt = lsGetChangedAt(user.id);
      const resolvedChangedAt = dbChangedAt ?? localChangedAt;
      const daysLeft = cooldownRemaining(resolvedChangedAt);

      if (localChangedAt && daysLeft === 0) lsClearChangedAt(user.id);

      setUsernameChangedAt(resolvedChangedAt);
      setCooldownLeft(daysLeft);

      // Broker connection status (Angel One)
      try {
        const { data: brokerData } = await supabase
          .from("broker_credentials")
          .select("broker_name, client_id")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        if (brokerData) {
          setBrokerConnected({
            broker: (brokerData as { broker_name?: string }).broker_name || "angelone",
            client_id: (brokerData as { client_id?: string | null }).client_id ?? null,
          });
        }
      } catch {
        // ignore
      }

      setLoading(false);
    };
    load();
  }, [navigate]);

  // ── Availability check helpers ────────────────────────────────────────────
  const doCheckAvailability = useCallback(async (
    value: string,
    uid: string,
  ): Promise<boolean> => {
    try {
      const res = await fetch(
        `${API_BASE}/api/user/check-username` +
        `?username=${encodeURIComponent(value)}&user_id=${uid}`
      );
      if (!res.ok) return true; // backend down → optimistic
      const data = await res.json();
      setUsernameStatus(data.available ? "available" : "taken");
      setUsernameHint(data.reason ?? "");
      return data.available;
    } catch {
      setUsernameStatus("idle");
      setUsernameHint("");
      return true; // offline — let save-time uniqueness catch it
    }
  }, []);

  const validateFormat = (value: string): boolean => {
    if (!value) {
      setUsernameStatus("invalid");
      setUsernameHint("Username cannot be empty.");
      return false;
    }
    if (!USERNAME_RE.test(value)) {
      setUsernameStatus("invalid");
      setUsernameHint("3–30 chars: letters, numbers, underscores only.");
      return false;
    }
    return true;
  };

  const checkUsername = useCallback((value: string, uid: string, original: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.toLowerCase() === original.toLowerCase() && value !== "") {
      setUsernameStatus("idle"); setUsernameHint(""); return;
    }
    if (!validateFormat(value)) return;
    setUsernameStatus("checking"); setUsernameHint("");
    debounceRef.current = setTimeout(() => doCheckAvailability(value, uid), 500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doCheckAvailability]);

  const checkUsernameNow = useCallback(async (
    value: string, uid: string, original: string,
  ) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.toLowerCase() === original.toLowerCase() && value !== "") {
      setUsernameStatus("idle"); setUsernameHint(""); return;
    }
    if (!validateFormat(value)) return;
    setUsernameStatus("checking"); setUsernameHint("");
    await doCheckAvailability(value, uid);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doCheckAvailability]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSaveProfile = async () => {
    if (!userId) { toast.error("Not authenticated"); return; }

    const usernameChanging =
      username.toLowerCase() !== originalUsername.toLowerCase();

    // ── 1. Cooldown gate ─────────────────────────────────────────────────────
    if (usernameChanging && cooldownLeft > 0) {
      toast.error(
        `You can only change your username every ${COOLDOWN_DAYS} days. ` +
        `${cooldownLeft} day${cooldownLeft !== 1 ? "s" : ""} remaining.`
      );
      return;
    }

    // ── 2. Format / availability gate ────────────────────────────────────────
    if (usernameChanging) {
      if (usernameStatus === "taken") {
        toast.error("That username is already taken — choose a different one.");
        return;
      }
      if (usernameStatus === "invalid") {
        toast.error(usernameHint || "Invalid username.");
        return;
      }
      if (usernameStatus === "checking") {
        toast.info("Still checking availability — please wait a moment.");
        return;
      }
      // Force-check if debounce never fired (paste scenario)
      if (usernameStatus === "idle") {
        setUsernameStatus("checking");
        const ok = await doCheckAvailability(username, userId);
        if (!ok) {
          toast.error("That username is already taken — choose a different one.");
          return;
        }
      }
    }

    setSaving(true);
    const now = new Date().toISOString();
    const newChangedAt = usernameChanging ? now : usernameChangedAt;

    // ── 3. Write directly to Supabase — try progressively simpler payloads ──
    //      until one succeeds, so missing columns never block a save.
    const isColumnError = (msg?: string) =>
      msg?.toLowerCase().includes("schema cache") ||
      msg?.toLowerCase().includes("could not find") ||
      msg?.toLowerCase().includes("column");

    // Attempt A — everything including optional columns
    const payloadFull: Record<string, unknown> = {
      username:              username.trim(),
      strategy_alerts:       strategyAlerts,
      market_updates:        marketUpdates,
      community_mentions:    communityMentions,
      updated_at:            now,
      ...(usernameChanging ? { username_changed_at: now } : {}),
    };

    // Attempt B — drop username_changed_at
    const payloadNoChangedAt: Record<string, unknown> = {
      username:           username.trim(),
      strategy_alerts:    strategyAlerts,
      market_updates:     marketUpdates,
      community_mentions: communityMentions,
      updated_at:         now,
    };

    // Attempt C — only guaranteed columns (username + updated_at always exist)
    const payloadMinimal: Record<string, unknown> = {
      username:    username.trim(),
      updated_at:  now,
    };

    let result = await supabase.from("profiles").update(payloadFull).eq("user_id", userId);

    if (result.error && isColumnError(result.error.message)) {
      result = await supabase.from("profiles").update(payloadNoChangedAt).eq("user_id", userId);
    }

    if (result.error && isColumnError(result.error.message)) {
      result = await supabase.from("profiles").update(payloadMinimal).eq("user_id", userId);
    }

    const sbError = result.error;
    if (sbError) {
      const isUnique =
        sbError.code === "23505" ||
        sbError.message?.toLowerCase().includes("unique") ||
        sbError.message?.toLowerCase().includes("duplicate");

      if (isUnique) {
        toast.error("That username is already taken — choose a different one.");
        setUsernameStatus("taken");
        setUsernameHint("That username is already taken.");
      } else {
        toast.error(`Failed to save: ${sbError.message}`);
      }
      setSaving(false);
      return;
    }

    // ── 4. Also call the backend for server-side validation record-keeping ────
    //      (best-effort — don't block on failure)
    try {
      const res = await fetch(`${API_BASE}/api/user/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id:            userId,
          username:           username.trim(),
          strategy_alerts:    strategyAlerts,
          market_updates:     marketUpdates,
          community_mentions: communityMentions,
        }),
      });
      if (res.status === 423) {
        // Backend says cooldown active — this shouldn't reach here in normal
        // flow but handle it gracefully
        const data = await res.json();
        toast.warning(data.detail ?? "Username recently changed.");
      }
    } catch {
      // Backend offline — Supabase write above already succeeded, so ignore
    }

    // ── 5. Persist cooldown timestamp to localStorage (works even without DB column) ──
    if (usernameChanging && userId) {
      lsSetChangedAt(userId, now);
    }

    // ── 6. Update local state ──────────────────────────────────────────────────
    toast.success("Profile saved successfully");
    setOriginalUsername(username.trim());
    setUsernameChangedAt(newChangedAt ?? null);
    setCooldownLeft(cooldownRemaining(newChangedAt ?? null));
    setUsernameStatus("idle");
    setUsernameHint("");
    setSaving(false);
  };

  // ── Broker connection ───────────────────────────────────────────────────
  const handleConnectBroker = async () => {
    if (!userId) {
      toast.error("Not authenticated");
      return;
    }
    const cid = brokerClientId.trim();
    const pin = brokerPin.trim();
    const totp = brokerTotpSecret.trim();
    if (!cid) {
      toast.error("Enter your Angel One client ID.");
      return;
    }
    if (!pin) {
      toast.error("Enter your Angel One PIN.");
      return;
    }
    if (!totp) {
      toast.error("Enter your Angel One TOTP secret (from 2FA setup).");
      return;
    }
    setBrokerLinking(true);
    try {
      const res = await fetch(`${API_BASE}/api/broker/angelone/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          client_id: cid,
          password: pin,
          totp_secret: totp,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof data.detail === "string" ? data.detail : "Broker connection failed.";
        throw new Error(msg);
      }
      toast.success("Broker connected. You can execute strategies from Strategy Studio.");
      setBrokerConnected({ broker: "angelone", client_id: cid });
      setBrokerClientId("");
      setBrokerPin("");
      setBrokerTotpSecret("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to connect broker.");
    } finally {
      setBrokerLinking(false);
    }
  };

  // ── Sign out ──────────────────────────────────────────────────────────────
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out successfully");
    navigate("/auth");
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-full">
          <div className="animate-pulse text-muted-foreground">Loading settings…</div>
        </div>
      </MainLayout>
    );
  }

  const isLocked        = cooldownLeft > 0;
  const usernameDirty   = username.toLowerCase() !== originalUsername.toLowerCase();
  const saveBlocked     = saving
    || (usernameDirty && (usernameStatus === "taken" || usernameStatus === "invalid" || usernameStatus === "checking"))
    || (usernameDirty && isLocked);

  return (
    <MainLayout>
      <div className="p-4 md:p-6 max-w-3xl mx-auto overflow-auto h-full">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your account preferences</p>
        </div>

        <div className="space-y-6">

          {/* ── Profile ──────────────────────────────────────────────────────── */}
          <div className="p-6 rounded-xl bg-card border border-border">
            <div className="flex items-center gap-3 mb-4">
              <User className="w-5 h-5 text-primary" />
              <h2 className="font-medium text-foreground">Profile</h2>
            </div>

            <div className="grid gap-4">

              {/* Username field */}
              <div className="grid gap-1.5">
                <Label htmlFor="username" className="flex items-center gap-2">
                  Username
                  {isLocked && (
                    <span className="flex items-center gap-1 text-[10px] text-yellow-500 font-normal">
                      <Lock className="w-3 h-3" />
                      Locked · {cooldownLeft}d remaining
                    </span>
                  )}
                </Label>

                {/* 14-day lock banner */}
                {isLocked && (
                  <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs">
                    <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                    <p>
                      Usernames can only be changed every {COOLDOWN_DAYS} days.
                      You changed yours <strong>{COOLDOWN_DAYS - cooldownLeft} day{COOLDOWN_DAYS - cooldownLeft !== 1 ? "s" : ""} ago</strong> — you can change it again
                      in <strong>{cooldownLeft} day{cooldownLeft !== 1 ? "s" : ""}</strong>.
                    </p>
                  </div>
                )}

                <div className="relative">
                  <Input
                    id="username"
                    placeholder="e.g. trader_rish"
                    value={username}
                    disabled={isLocked}
                    onChange={e => {
                      const v = e.target.value;
                      setUsername(v);
                      checkUsername(v, userId, originalUsername);
                    }}
                    onBlur={e => checkUsernameNow(e.target.value, userId, originalUsername)}
                    className={`bg-background pr-8 transition-colors ${
                      isLocked
                        ? "opacity-60 cursor-not-allowed"
                        : usernameStatus === "taken"     ? "border-loss   focus-visible:ring-loss/30"
                        : usernameStatus === "invalid"   ? "border-loss   focus-visible:ring-loss/30"
                        : usernameStatus === "available" ? "border-profit focus-visible:ring-profit/30"
                        : "border-border"
                    }`}
                  />
                  {!isLocked && (
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                      {usernameStatus === "checking"  && <Loader2     className="w-4 h-4 text-muted-foreground animate-spin" />}
                      {usernameStatus === "available" && <CheckCircle2 className="w-4 h-4 text-profit" />}
                      {(usernameStatus === "taken" || usernameStatus === "invalid") &&
                        <XCircle className="w-4 h-4 text-loss" />}
                    </span>
                  )}
                </div>

                {/* Hint line */}
                {!isLocked && (
                  <>
                    {usernameStatus === "checking"  && <p className="text-[11px] text-muted-foreground">Checking availability…</p>}
                    {usernameStatus === "available" && <p className="text-[11px] text-profit">"{username}" is available!</p>}
                    {(usernameStatus === "taken" || usernameStatus === "invalid") &&
                      <p className="text-[11px] text-loss">{usernameHint}</p>}
                    {usernameStatus === "idle" && (
                      <p className="text-[11px] text-muted-foreground">
                        3–30 chars · letters, numbers, underscores ·{" "}
                        <span className="text-yellow-500/80">can only change every {COOLDOWN_DAYS} days</span>
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Email */}
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  disabled
                  className="bg-muted border-border text-muted-foreground"
                />
                <p className="text-xs text-muted-foreground">Email cannot be changed</p>
              </div>

              <Button
                onClick={handleSaveProfile}
                disabled={saveBlocked}
                className="w-fit"
              >
                {saving ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </div>

          {/* ── Broker connection (Angel One) ─────────────────────────────────── */}
          <div className="p-6 rounded-xl bg-card border border-border">
            <div className="flex items-center gap-3 mb-4">
              <PlugZap className="w-5 h-5 text-primary" />
              <h2 className="font-medium text-foreground">Broker Connection</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Connect your Angel One account to execute strategies from Strategy Studio directly to your broker.
            </p>
            {brokerConnected ? (
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                <p className="text-sm font-medium text-foreground flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-profit" />
                  Connected to Angel One{brokerConnected.client_id ? ` (${brokerConnected.client_id})` : ""}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Deploy a strategy in Strategy Studio and choose &quot;Live Execution&quot; to place orders to this account.
                </p>
              </div>
            ) : (
              <div className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="broker_client_id">Angel One Client ID</Label>
                  <Input
                    id="broker_client_id"
                    value={brokerClientId}
                    onChange={(e) => setBrokerClientId(e.target.value)}
                    placeholder="e.g. D1234567"
                    className="bg-background border-border"
                    autoComplete="off"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="broker_pin">PIN</Label>
                  <Input
                    id="broker_pin"
                    type="password"
                    value={brokerPin}
                    onChange={(e) => setBrokerPin(e.target.value)}
                    placeholder="Your Angel One PIN"
                    className="bg-background border-border"
                    autoComplete="off"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="broker_totp">TOTP Secret</Label>
                  <Input
                    id="broker_totp"
                    type="password"
                    value={brokerTotpSecret}
                    onChange={(e) => setBrokerTotpSecret(e.target.value)}
                    placeholder="From Angel One 2FA setup"
                    className="bg-background border-border"
                    autoComplete="off"
                  />
                </div>
                <Button onClick={handleConnectBroker} disabled={brokerLinking}>
                  {brokerLinking ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Connecting…
                    </>
                  ) : (
                    "Connect Angel One"
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* ── Notifications ─────────────────────────────────────────────────── */}
          <div className="p-6 rounded-xl bg-card border border-border">
            <div className="flex items-center gap-3 mb-1">
              <Bell className="w-5 h-5 text-primary" />
              <h2 className="font-medium text-foreground">Notifications</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4 ml-8">
              Preferences are saved with the "Save Changes" button above.
            </p>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Strategy Alerts</p>
                  <p className="text-xs text-muted-foreground">Get notified when strategies trigger</p>
                </div>
                <Switch checked={strategyAlerts} onCheckedChange={setStrategyAlerts} />
              </div>

              <Separator className="bg-border" />

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Market Updates</p>
                  <p className="text-xs text-muted-foreground">Daily market summary emails</p>
                </div>
                <Switch checked={marketUpdates} onCheckedChange={setMarketUpdates} />
              </div>

              <Separator className="bg-border" />

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Community Mentions</p>
                  <p className="text-xs text-muted-foreground">When someone mentions you</p>
                </div>
                <Switch checked={communityMentions} onCheckedChange={setCommunityMentions} />
              </div>
            </div>
          </div>

          {/* ── Subscription (untouched) ──────────────────────────────────────── */}
          <div className="p-6 rounded-xl bg-card border border-border">
            <div className="flex items-center gap-3 mb-4">
              <CreditCard className="w-5 h-5 text-primary" />
              <h2 className="font-medium text-foreground">Subscription</h2>
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border">
              <div>
                <p className="text-sm font-medium text-foreground">Free Plan</p>
                <p className="text-xs text-muted-foreground">Limited features and backtests</p>
              </div>
              <Button className="btn-glow bg-gradient-to-r from-primary to-accent">
                Upgrade to Pro
              </Button>
            </div>
          </div>

          {/* ── SEBI Verification (untouched) ─────────────────────────────────── */}
          <div className="p-6 rounded-xl bg-card border border-border">
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-5 h-5 text-gold" />
              <h2 className="font-medium text-foreground">SEBI Verification</h2>
            </div>
            <div className="p-4 rounded-lg bg-gold/5 border border-gold/20">
              <p className="text-sm text-foreground mb-2">Are you a SEBI Registered Investment Advisor?</p>
              <p className="text-xs text-muted-foreground mb-4">
                Get verified to access the Expert Lounge and add a gold badge to your strategies.
              </p>
              <Button variant="outline" className="border-gold text-gold hover:bg-gold/10">
                Apply for Verification
              </Button>
            </div>
          </div>

          {/* ── Sign Out ──────────────────────────────────────────────────────── */}
          <div className="p-6 rounded-xl bg-card border border-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Sign Out</p>
                <p className="text-xs text-muted-foreground">Sign out of your account</p>
              </div>
              <Button
                variant="outline"
                onClick={handleSignOut}
                className="text-loss border-loss/30 hover:bg-loss/10"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>

        </div>
      </div>
    </MainLayout>
  );
}
