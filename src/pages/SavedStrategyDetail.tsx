import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EquityCurveChart } from "@/components/charts/EquityCurveChart";
import { MetricsGrid } from "@/components/studio/MetricsGrid";
import { CodeViewer } from "@/components/studio/CodeViewer";
import { API_BASE } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SavedStrategy {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  code: string;
  ticker: string;
  cagr?: number | null;
  total_return?: number | null;
  max_drawdown?: number | null;
  volatility?: number | null;
  sharpe_ratio?: number | null;
  sortino_ratio?: number | null;
  win_rate?: number | null;
  total_trades?: number | null;
  equity_curve?: { time: string; value: number }[] | null;
  created_at?: string;
}

export default function SavedStrategyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [strategy, setStrategy] = useState<SavedStrategy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError("Missing strategy id.");
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    setError(null);
    setStrategy(null);
    let cancelled = false;

    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) {
          if (!cancelled) {
            setError("You must be signed in to view this strategy.");
            setLoading(false);
          }
          return;
        }
        const res = await fetch(
          `${API_BASE}/api/strategies/${encodeURIComponent(id)}?user_id=${encodeURIComponent(user.id)}`,
        );
        if (cancelled) return;
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const msg =
            typeof data.detail === "string"
              ? data.detail
              : `Failed to load strategy (HTTP ${res.status})`;
          throw new Error(msg);
        }
        const row: SavedStrategy = await res.json();
        if (!cancelled) setStrategy(row);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load strategy.";
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
  }, [id]);

  const handleDeploy = () => {
    if (!strategy?.code?.trim()) {
      toast.error("No strategy code available to deploy.");
      return;
    }
    const title = strategy.name || "Saved strategy";
    navigate("/terminal", {
      state: {
        fromSavedStrategy: true,
        title,
        logicText: strategy.code,
        ticker: strategy.ticker,
      },
    });
    toast.success("Opening Live Terminal with this saved strategy.");
  };

  const metricsForGrid = strategy
    ? {
        cagr: strategy.cagr ?? undefined,
        drawdown: strategy.max_drawdown ?? undefined,
        sharpe: strategy.sharpe_ratio ?? undefined,
        total_return: strategy.total_return ?? undefined,
        volatility: strategy.volatility ?? undefined,
        sortino: strategy.sortino_ratio ?? undefined,
        num_trades: strategy.total_trades ?? undefined,
        win_rate: strategy.win_rate ?? undefined,
      }
    : undefined;

  return (
    <MainLayout>
      <div className="p-4 md:p-6 max-w-6xl mx-auto h-full overflow-auto">
        {loading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            Loading strategy…
          </div>
        )}

        {!loading && error && !strategy && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={() => navigate("/saved-strategies")}>
              Back to Saved Strategies
            </Button>
          </div>
        )}

        {!loading && strategy && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-semibold text-foreground break-words">
                    {strategy.name}
                  </h1>
                  <Badge variant="outline" className="font-mono text-[10px] uppercase">
                    {strategy.ticker}
                  </Badge>
                </div>
                {strategy.description && (
                  <p className="text-sm text-muted-foreground max-w-3xl whitespace-pre-line">
                    {strategy.description}
                  </p>
                )}
                {strategy.created_at && (
                  <p className="text-xs text-muted-foreground/70">
                    Saved on{" "}
                    {new Date(strategy.created_at).toLocaleString("en-IN", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/saved-strategies")}
                  className="border-border text-muted-foreground hover:bg-muted/40"
                >
                  Back to Library
                </Button>
                <Button onClick={handleDeploy}>
                  Deploy to Live Terminal
                </Button>
              </div>
            </div>

            {/* Metrics */}
            <Card className="bg-card/80 border-border">
              <CardContent className="p-4">
                <MetricsGrid metrics={metricsForGrid} />
              </CardContent>
            </Card>

            {/* Equity curve — chart sanitizes and caps data internally */}
            <Card className="bg-card/80 border-border">
              <CardContent className="p-4">
                <EquityCurveChart chartData={strategy.equity_curve ?? undefined} />
              </CardContent>
            </Card>

            {/* Code */}
            <Card className="bg-card/80 border-border">
              <CardContent className="p-0">
                <CodeViewer code={strategy.code} />
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </MainLayout>
  );
}

