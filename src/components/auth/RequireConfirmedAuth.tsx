import { useState, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Mail, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Outlet } from "react-router-dom";

/**
 * Protects routes so only signed-in users with confirmed email can access.
 * - No session → redirect to /auth
 * - Session but email not confirmed → show "Confirm your email" screen (no app access)
 * - Session and email confirmed → render children (Outlet)
 */
export function RequireConfirmedAuth() {
  const [state, setState] = useState<"loading" | "guest" | "unconfirmed" | "allowed">("loading");
  const [email, setEmail] = useState<string>("");
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setState("guest");
        return;
      }
      // Treat as unconfirmed if email_confirmed_at or confirmed_at is missing (Supabase may use either).
      const confirmed = !!(user.email_confirmed_at ?? (user as { confirmed_at?: string }).confirmed_at);
      if (!confirmed) {
        setEmail(user.email ?? "");
        setState("unconfirmed");
        return;
      }
      setState("allowed");
    };

    check();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      if (!cancelled) check();
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  if (state === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Checking access…</p>
        </div>
      </div>
    );
  }

  if (state === "guest") {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (state === "unconfirmed") {
    return (
      <div className="min-h-screen bg-background flex">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md text-center space-y-6">
            <div className="flex justify-center">
              <div className="rounded-full bg-primary/10 p-4">
                <Mail className="w-10 h-10 text-primary" />
              </div>
            </div>
            <h1 className="text-2xl font-semibold text-foreground">
              Confirm your email
            </h1>
            <p className="text-muted-foreground">
              We sent a confirmation link to <strong className="text-foreground">{email}</strong>.
              Click the link in that email to activate your account and access Tradeky.
            </p>
            <p className="text-sm text-muted-foreground">
              After confirming, you’ll be redirected back here. If you don’t see the email, check your spam folder.
            </p>
            <p className="text-xs text-muted-foreground">
              Need a new link? Sign out and sign in again, then check your email for a new confirmation link.
            </p>
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = "/auth";
              }}
              className="text-sm text-primary hover:underline"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
