import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Mode = "paper" | "live";

interface BrokerOption {
  id: string;
  label: string;
}

interface DeploymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmPaper: () => void;
  onConfirmLive?: (opts: { brokerId: string; capital: number }) => void | Promise<void>;
  hasActiveBroker: boolean;
  brokers: BrokerOption[];
  liveDeploying?: boolean;
}

export function DeploymentModal({
  open,
  onOpenChange,
  onConfirmPaper,
  onConfirmLive,
  hasActiveBroker,
  brokers,
  liveDeploying = false,
}: DeploymentModalProps) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("paper");
  const [selectedBrokerId, setSelectedBrokerId] = useState<string>("");
  const [capital, setCapital] = useState<string>("");

  const handlePaper = () => {
    onConfirmPaper();
    onOpenChange(false);
  };

  const handleLive = async () => {
    if (!hasActiveBroker) {
      return;
    }
    const brokerId = selectedBrokerId || (brokers[0]?.id ?? "");
    const capitalNum = Number(capital || 0);
    if (!brokerId || !onConfirmLive) return;
    try {
      await Promise.resolve(onConfirmLive({ brokerId, capital: Number.isNaN(capitalNum) ? 0 : capitalNum }));
      onOpenChange(false);
    } catch {
      // Error toast handled by parent
    }
  };

  const paperSelected = mode === "paper";
  const liveSelected = mode === "live";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deploy Strategy</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Choose how you want to deploy this strategy. You can start with paper trading, or route live
            orders to connected broker accounts.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setMode("paper")}
              className={`flex flex-col items-start gap-2 rounded-lg border px-4 py-3 text-left transition-colors ${
                paperSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">Paper Trading</span>
                <Badge variant="outline" className="text-[10px] uppercase">
                  Simulated
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Deploy to the simulated Live Terminal. Ideal for testing new ideas without real capital.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setMode("live")}
              className={`flex flex-col items-start gap-2 rounded-lg border px-4 py-3 text-left transition-colors ${
                liveSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">Live Execution</span>
                <Badge variant="outline" className="text-[10px] uppercase">
                  Brokers
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Route real orders to connected broker accounts with per-client capital allocation.
              </p>
            </button>
          </div>

          {paperSelected && (
            <div className="mt-2 flex justify-end">
              <Button size="sm" onClick={handlePaper}>
                Confirm Paper Deployment
              </Button>
            </div>
          )}

          {liveSelected && (
            <div className="space-y-3 mt-2">
              {!hasActiveBroker && (
                <div className="rounded-md border border-yellow-500/40 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-200 flex flex-col gap-2">
                  <span>No active broker connections found.</span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-yellow-500/60 text-yellow-200 hover:bg-yellow-500/10"
                      onClick={() => {
                        onOpenChange(false);
                        navigate("/integrations");
                      }}
                    >
                      Go to Integrations
                    </Button>
                  </div>
                </div>
              )}

              {hasActiveBroker && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Broker Account</label>
                    <Select
                      value={selectedBrokerId || brokers[0]?.id}
                      onValueChange={(v) => setSelectedBrokerId(v)}
                    >
                      <SelectTrigger className="h-9 bg-card border-border text-xs">
                        <SelectValue placeholder="Select broker account" />
                      </SelectTrigger>
                      <SelectContent>
                        {brokers.map((b) => (
                          <SelectItem key={b.id} value={b.id} className="text-xs">
                            {b.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground/80">Target: All Active Client Accounts</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      Capital Allocation (₹)
                    </label>
                    <Input
                      type="number"
                      min={0}
                      value={capital}
                      onChange={(e) => setCapital(e.target.value)}
                      className="h-9 bg-card border-border text-xs"
                      placeholder="e.g. 250000"
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button size="sm" onClick={handleLive} disabled={liveDeploying}>
                      {liveDeploying ? "Placing order…" : "Confirm Live Deployment"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

