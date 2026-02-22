import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Handles redirect after email confirmation (and other auth redirects).
 * With detectSessionInUrl, the client picks up hash or query params and sets the session.
 * We then send the user to the app.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const params = new URLSearchParams(location.search);
      const code = params.get("code");
      if (code) {
        const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (exchangeErr) {
          setError(exchangeErr.message);
          return;
        }
      }

      const { data: { session }, error: err } = await supabase.auth.getSession();
      if (cancelled) return;
      if (err) {
        setError(err.message);
        return;
      }
      if (session) {
        navigate("/strategy-studio", { replace: true });
        return;
      }
      navigate("/auth", { replace: true });
    };

    run();
  }, [navigate, location.search]);

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center text-muted-foreground">
          <p className="mb-2">Something went wrong.</p>
          <button
            type="button"
            onClick={() => navigate("/auth", { replace: true })}
            className="text-primary hover:underline"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Completing sign in…</p>
      </div>
    </div>
  );
}
