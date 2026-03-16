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
import { supabase } from "@/integrations/supabase/client";

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
    targetAccounts?: unknown;
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
  const [targetAccountsSelection, setTargetAccountsSelection] = useState<string>("personal");
  const [clientOptions, setClientOptions] = useState<{ id: string; client_name: string; status?: string | null }[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);

  useEffect(() => {
    if (open && deploySymbol?.value) setDeploySymbolValue(deploySymbol.value);
  }, [open, deploySymbol?.value]);

  useEffect(() => {
    if (!open || !hasActiveBroker) return;
    let isCancelled = false;
    const fetchClients = async () => {
      setLoadingClients(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user?.id) {
          if (!isCancelled) {
            setClientOptions([]);
          }
          return;
        }
        const { data, error } = await supabase
          .from("client_accounts")
          .select("id, client_name, status, created_at")
          .eq("ria_user_id", user.id)
          .order("created_at", { ascending: false });
        if (error) {
          // eslint-disable-next-line no-console
          console.error("Failed to load client_accounts for deployment modal:", error);
          if (!isCancelled) {
            setClientOptions([]);
          }
          return;
        }
        const rows = Array.isArray(data) ? data : [];
        const active = rows.filter((r) => (r.status ?? "Active") === "Active");
        if (!isCancelled) {
          setClientOptions(active);
          // If RIA has active clients, default to all_active_clients; else personal.
          setTargetAccountsSelection(active.length > 0 ? "all_active_clients" : "personal");
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("Error while fetching client_accounts for deployment modal:", e);
        if (!isCancelled) {
          setClientOptions([]);
        }
      } finally {
        if (!isCancelled) {
          setLoadingClients(false);
        }
      }
    };
    fetchClients();
    return () => {
      isCancelled = true;
    };
  }, [open, hasActiveBroker]);

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
    let targetAccounts: unknown = { type: "personal" };
    if (hasActiveClients && clientOptions.length > 0) {
      if (targetAccountsSelection === "all_active_clients") {
        targetAccounts = { type: "all_active_clients" };
      } else if (targetAccountsSelection === "personal") {
        targetAccounts = { type: "personal" };
      } else {
        const client = clientOptions.find((c) => c.id === targetAccountsSelection);
        if (client) {
          targetAccounts = {
            type: "single_client",
            client_id: client.id,
            client_name: client.client_name,
          };
        } else {
          targetAccounts = { type: "personal" };
        }
      }
    }
    try {
      await Promise.resolve(
        onConfirmLive({
          brokerId,
          capital: Number.isNaN(capitalNum) ? 0 : capitalNum,
          symbol: selectedDeploySymbol?.value,
          angel_symbol: selectedDeploySymbol?.angelSymbol,
          token: selectedDeploySymbol?.token,
          targetAccounts,
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
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Target Accounts</label>
                    <Select
                      value={targetAccountsSelection}
                      onValueChange={(v) => setTargetAccountsSelection(v)}
                    >
                      <SelectTrigger className="h-9 bg-card border-border text-xs">
                        <SelectValue placeholder="Select target accounts" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all_active_clients" className="text-xs">
                          Target: All Active Client Accounts
                        </SelectItem>
                        <SelectItem value="personal" className="text-xs">
                          Target: Personal Broker Account
                        </SelectItem>
                        {clientOptions.map((client) => (
                          <SelectItem key={client.id} value={client.id} className="text-xs">
                            {`Client: ${client.client_name}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {loadingClients && (
                      <p className="text-[10px] text-muted-foreground/80">
                        Loading client accounts…
                      </p>
                    )}
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

