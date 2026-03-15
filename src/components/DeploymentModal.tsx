import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Mode = "paper" | "live";

interface BrokerOption {
  id: string;
  label: string;
}

/** Option for "Stock for deployment" in live mode. */
export interface DeploySymbolOption {
  value: string;
  label: string;
  angelSymbol?: string;
  token?: string;
}

interface DeploymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmPaper: () => void;
  onConfirmLive?: (opts: {
    brokerId: string;
    capital: number;
    symbol?: string;
    angel_symbol?: string;
    token?: string;
  }) => void | Promise<void>;
  hasActiveBroker: boolean;
  hasActiveClients?: boolean;
  brokers: BrokerOption[];
  liveDeploying?: boolean;
  /** Current symbol (e.g. from backtest). Used as default for live deploy. */
  deploySymbol?: DeploySymbolOption | null;
  /** All symbols user can deploy on (any stock). If provided, show symbol dropdown in live section. */
  deploySymbolOptions?: { heading: string; instruments: DeploySymbolOption[] }[] | DeploySymbolOption[];
}

function flattenSymbolOptions(
  opts: { heading: string; instruments: DeploySymbolOption[] }[] | DeploySymbolOption[]
): DeploySymbolOption[] {
  if (!opts?.length) return [];
  const first = opts[0];
  if ("heading" in first && "instruments" in first) {
    return (opts as { heading: string; instruments: DeploySymbolOption[] }[]).flatMap((g) => g.instruments);
  }
  return opts as DeploySymbolOption[];
}

export function DeploymentModal({
  open,
  onOpenChange,
  onConfirmPaper,
  onConfirmLive,
  hasActiveBroker,
  hasActiveClients = false,
  brokers,
  liveDeploying = false,
  deploySymbol = null,
  deploySymbolOptions,
}: DeploymentModalProps) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("paper");
  const [selectedBrokerId, setSelectedBrokerId] = useState<string>("");
  const [capital, setCapital] = useState<string>("");
  const flatSymbols = deploySymbolOptions ? flattenSymbolOptions(deploySymbolOptions) : [];
  const [deploySymbolValue, setDeploySymbolValue] = useState<string>(deploySymbol?.value ?? flatSymbols[0]?.value ?? "");

  useEffect(() => {
    if (open && deploySymbol?.value) setDeploySymbolValue(deploySymbol.value);
  }, [open, deploySymbol?.value]);

  const selectedDeploySymbol =
    flatSymbols.find((s) => s.value === deploySymbolValue) ?? deploySymbol ?? flatSymbols[0];

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
      await Promise.resolve(
        onConfirmLive({
          brokerId,
          capital: Number.isNaN(capitalNum) ? 0 : capitalNum,
          symbol: selectedDeploySymbol?.value,
          angel_symbol: selectedDeploySymbol?.angelSymbol,
          token: selectedDeploySymbol?.token,
        })
      );
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
            Choose how you want to deploy. Orders are executed strictly when your strategy conditions are met (e.g. signal from your backtest logic).
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
                Run your strategy in the Live Terminal (simulated). Trades fire only when your strategy conditions are met.
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
                Deploy to your broker. Real orders are placed only when your strategy conditions are met (monitored on the server).
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
                  {flatSymbols.length > 0 && (
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Stock for deployment</label>
                      <Select value={deploySymbolValue} onValueChange={setDeploySymbolValue}>
                        <SelectTrigger className="h-9 bg-card border-border text-xs">
                          <SelectValue placeholder="Select stock" />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.isArray(deploySymbolOptions) &&
                          deploySymbolOptions.length > 0 &&
                          "heading" in deploySymbolOptions[0] ? (
                            (deploySymbolOptions as { heading: string; instruments: DeploySymbolOption[] }[]).map(
                              (group) => (
                                <SelectGroup key={group.heading}>
                                  <SelectLabel className="text-muted-foreground">{group.heading}</SelectLabel>
                                  {group.instruments.map((inst) => (
                                    <SelectItem key={inst.value} value={inst.value} className="text-xs">
                                      {inst.label}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              )
                            )
                          ) : (
                            flatSymbols.map((inst) => (
                              <SelectItem key={inst.value} value={inst.value} className="text-xs">
                                {inst.label}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
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
                    <p className="text-xs text-muted-foreground/80">
                      Target: {hasActiveClients ? "All Active Client Accounts" : "Your broker (Angel One)"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      Capital / Quantity (₹)
                    </label>
                    <Input
                      type="number"
                      min={0}
                      value={capital}
                      onChange={(e) => setCapital(e.target.value)}
                      className="h-9 bg-card border-border text-xs"
                      placeholder="e.g. 250000"
                    />
                    <p className="text-[10px] text-muted-foreground/80">
                      Order size at execution: capital ÷ price (min 1 share). We monitor your strategy and place one order when conditions are met, then stop.
                    </p>
                  </div>
                  <div className="flex justify-end">
                    <Button size="sm" onClick={handleLive} disabled={liveDeploying}>
                      {liveDeploying ? "Deploying…" : "Confirm Live Deployment"}
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

