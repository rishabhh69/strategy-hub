import { useEffect, useState, useCallback } from "react";
import { Rocket, Square, Loader2 } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { API_BASE } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Deployment {
  deployment_id: string;
  strategy_name: string;
  target_accounts: string;
  status: string;
  created_at?: string;
}

export default function DeployedStrategies() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [stoppingId, setStoppingId] = useState<string | null>(null);

  const fetchDeployments = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) {
        setDeployments([]);
        return;
      }
      const res = await fetch(
        `${API_BASE}/api/engine/deployments?user_id=${encodeURIComponent(user.id)}`,
      );
      if (!res.ok) {
        setDeployments([]);
        return;
      }
      const rows: Deployment[] = await res.json();
      setDeployments(rows || []);
    } catch {
      setDeployments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchDeployments();
  }, [fetchDeployments]);

  const handleStop = async (deploymentId: string) => {
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
        await fetchDeployments();
      } else {
        toast.error(data?.message || "Failed to stop deployment.");
      }
    } catch {
      toast.error("Failed to stop deployment.");
    } finally {
      setStoppingId(null);
    }
  };

  const formatDate = (iso?: string) => {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
    } catch {
      return iso;
    }
  };

  return (
    <MainLayout>
      <div className="p-4 md:p-6 max-w-7xl w-full h-full overflow-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-foreground">Deployed Strategies</h1>
          <p className="text-sm text-muted-foreground">
            All strategies you have deployed to live or client accounts. Stop a running deployment at any time.
          </p>
        </div>

        {loading && (
          <div className="py-16 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading deployed strategies…
          </div>
        )}

        {!loading && deployments.length === 0 && (
          <Card className="border-border bg-card/50">
            <CardContent className="py-12 text-center">
              <Rocket className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No deployed strategies yet.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Deploy a strategy from Strategy Studio (Run backtest → Deploy → Live Execution).
              </p>
            </CardContent>
          </Card>
        )}

        {!loading && deployments.length > 0 && (
          <div className="space-y-3">
            {deployments.map((d) => (
              <Card
                key={d.deployment_id}
                className="border-border bg-card/50 hover:border-border-bright transition-colors"
              >
                <CardHeader className="pb-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-base font-medium truncate">
                        {d.strategy_name || "Unnamed strategy"}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Deployed on: <span className="text-foreground font-medium">{d.target_accounts}</span>
                      </p>
                      {d.created_at && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Created {formatDate(d.created_at)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant={d.status === "running" ? "default" : "secondary"}
                        className={d.status === "running" ? "bg-profit/20 text-profit border-profit/40" : ""}
                      >
                        {d.status === "running" ? "Running" : "Stopped"}
                      </Badge>
                      {d.status === "running" && (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="gap-1.5"
                          disabled={stoppingId === d.deployment_id}
                          onClick={() => handleStop(d.deployment_id)}
                        >
                          {stoppingId === d.deployment_id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Square className="w-3.5 h-3.5" />
                          )}
                          {stoppingId === d.deployment_id ? "Stopping…" : "Stop"}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
