import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { API_BASE } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SavedStrategy {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  ticker: string;
  cagr?: number | null;
  total_return?: number | null;
  max_drawdown?: number | null;
  volatility?: number | null;
  sharpe_ratio?: number | null;
  sortino_ratio?: number | null;
  win_rate?: number | null;
  total_trades?: number | null;
  created_at?: string;
}

export default function SavedStrategies() {
  const navigate = useNavigate();
  const [strategies, setStrategies] = useState<SavedStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) {
          setError("You must be signed in to view saved strategies.");
          setLoading(false);
          return;
        }
        const res = await fetch(
          `${API_BASE}/api/strategies/mine?user_id=${encodeURIComponent(user.id)}`,
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const msg =
            typeof data.detail === "string"
              ? data.detail
              : `Failed to load saved strategies (HTTP ${res.status})`;
          throw new Error(msg);
        }
        const rows: SavedStrategy[] = await res.json();
        if (!cancelled) {
          setStrategies(rows || []);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load saved strategies.";
        if (!cancelled) {
          setError(msg);
          toast.error(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const fmtPct = (n?: number | null) =>
    n != null && !Number.isNaN(n) ? `${n.toFixed(2)}%` : "—";

  const fmtRatio = (n?: number | null) =>
    n != null && !Number.isNaN(n) ? n.toFixed(2) : "—";

  return (
    <MainLayout>
      <div className="p-4 md:p-6 max-w-6xl mx-auto h-full overflow-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Saved Strategies</h1>
            <p className="text-sm text-muted-foreground">
              Your private library of backtested strategies.
            </p>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            Loading your saved strategies…
          </div>
        )}

        {!loading && error && strategies.length === 0 && (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
            {error}
          </div>
        )}

        {!loading && !error && strategies.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted/40 border border-border/60 mb-1">
              <span className="text-lg text-muted-foreground">★</span>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                Your strategy library is empty
              </p>
              <p className="text-xs text-muted-foreground/80 max-w-sm mx-auto">
                Run a backtest in Strategy Studio and save your favorite strategies to build a private playbook.
              </p>
            </div>
            <Button
              size="sm"
              className="mt-2"
              onClick={() => navigate("/strategy-studio")}
            >
              Go to Strategy Studio
            </Button>
          </div>
        )}

        {!loading && strategies.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {strategies.map((s) => (
              <Card
                key={s.id}
                className="bg-card/80 border-border hover:border-border-bright cursor-pointer transition-colors flex flex-col"
                onClick={() => navigate(`/saved-strategies/${s.id}`)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm font-semibold text-foreground line-clamp-2">
                      {s.name}
                    </CardTitle>
                    <Badge variant="outline" className="font-mono text-[10px] uppercase">
                      {s.ticker}
                    </Badge>
                  </div>
                  {s.description && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {s.description}
                    </p>
                  )}
                </CardHeader>
                <CardContent className="pt-2 pb-3 flex-1 flex flex-col">
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <div className="text-center p-2 rounded-lg bg-muted/40">
                      <p className="text-[10px] text-muted-foreground mb-0.5">CAGR</p>
                      <p className="font-data text-sm text-profit">
                        {fmtPct(s.cagr ?? undefined)}
                      </p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted/40">
                      <p className="text-[10px] text-muted-foreground mb-0.5">Sharpe</p>
                      <p className="font-data text-sm text-foreground">
                        {fmtRatio(s.sharpe_ratio ?? undefined)}
                      </p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted/40">
                      <p className="text-[10px] text-muted-foreground mb-0.5">Win Rate</p>
                      <p className="font-data text-sm text-foreground">
                        {fmtPct(s.win_rate ?? undefined)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-auto flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>
                      {s.total_trades != null ? `${s.total_trades} trades` : "Trades: —"}
                    </span>
                    {s.created_at && (
                      <span>
                        {new Date(s.created_at).toLocaleDateString("en-IN", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}

