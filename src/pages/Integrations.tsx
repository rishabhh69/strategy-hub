import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PlugZap } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { API_BASE } from "@/lib/api";

interface BrokerCredentialRow {
  id: string;
  broker_name: string;
  is_active: boolean;
  created_at: string | null;
}

export default function Integrations() {
  const [loading, setLoading] = useState(true);
  const [brokers, setBrokers] = useState<BrokerCredentialRow[]>([]);
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchBrokers = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) {
        setBrokers([]);
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("broker_credentials")
        .select("id, broker_name, is_active, created_at")
        .eq("user_id", user.id);
      if (error) throw error;
      setBrokers((data ?? []) as BrokerCredentialRow[]);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load broker integrations.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBrokers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnectBroker = () => {
    setClientId("");
    setPin("");
    setConnectDialogOpen(true);
  };

  const handleAngelLogin = async () => {
    try {
      setSubmitting(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) {
        toast.error("You must be signed in to link your broker.");
        return;
      }
      const res = await fetch(`${API_BASE}/api/broker/angelone/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          password: pin,
          user_id: user.id,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg =
          typeof data.detail === "string"
            ? data.detail
            : `Angel One login failed (HTTP ${res.status})`;
        throw new Error(msg);
      }
      toast.success("Angel One connected successfully.");
      setConnectDialogOpen(false);
      setLoading(true);
      await fetchBrokers();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Angel One login failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MainLayout>
      <div className="p-4 md:p-6 max-w-7xl w-full mx-auto h-full overflow-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <PlugZap className="w-5 h-5 text-primary" />
              Broker Integrations
            </h1>
            <p className="text-sm text-muted-foreground">
              Connect broker accounts for live strategy execution across multiple clients.
            </p>
          </div>
          <Button
            size="sm"
            className="btn-glow bg-gradient-to-r from-primary to-accent"
            onClick={handleConnectBroker}
          >
            Connect Angel One
          </Button>
        </div>

        <Card className="bg-card/80 border-border">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              Connected Brokers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-xs text-muted-foreground">Loading broker connections…</p>
            ) : brokers.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No broker accounts connected yet. Click &quot;Connect Broker&quot; to get started.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="text-xs text-muted-foreground">Broker</TableHead>
                    <TableHead className="text-xs text-muted-foreground">Status</TableHead>
                    <TableHead className="text-xs text-muted-foreground">Date Connected</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {brokers.map((b) => (
                    <TableRow key={b.id} className="border-border">
                      <TableCell className="text-sm text-foreground">
                        {b.broker_name}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={b.is_active ? "default" : "outline"}
                          className={b.is_active ? "bg-profit/20 text-profit border-profit/40" : ""}
                        >
                          {b.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {b.created_at ? new Date(b.created_at).toLocaleDateString("en-IN") : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Connect Angel One</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="client-id" className="text-xs text-muted-foreground">
                  Client ID
                </Label>
                <Input
                  id="client-id"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="bg-card border-border text-sm"
                  placeholder="Your Angel One client ID"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pin" className="text-xs text-muted-foreground">
                  PIN
                </Label>
                <Input
                  id="pin"
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="bg-card border-border text-sm"
                  placeholder="Account PIN"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConnectDialogOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleAngelLogin}
                  disabled={submitting || !clientId || !pin}
                >
                  {submitting ? "Connecting…" : "Connect"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}

