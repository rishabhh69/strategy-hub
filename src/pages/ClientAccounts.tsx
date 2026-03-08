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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserPlus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { API_BASE } from "@/lib/api";

interface ClientRow {
  id: string;
  client_name: string;
  capital_allocation: number;
  broker: string;
  client_id: string;
  status: string;
  created_at?: string;
}

export default function ClientAccounts() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form state for Add Client
  const [fullName, setFullName] = useState("");
  const [capitalAllocation, setCapitalAllocation] = useState<string>("");
  const [broker, setBroker] = useState("angelone");
  const [brokerClientId, setBrokerClientId] = useState("");
  const [brokerPin, setBrokerPin] = useState("");
  const [totpSecret, setTotpSecret] = useState("");

  const fetchClients = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) {
        setUserId(null);
        setClients([]);
        setLoading(false);
        return;
      }
      setUserId(user.id);
      const res = await fetch(
        `${API_BASE}/api/clients/list?user_id=${encodeURIComponent(user.id)}`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err.detail === "string" ? err.detail : "Failed to load clients");
      }
      const data = await res.json();
      setClients(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to load client accounts.");
      setClients([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const handleAddClient = async () => {
    if (!userId) {
      toast.error("You must be signed in to add a client.");
      return;
    }
    const name = fullName.trim();
    const cap = parseFloat(capitalAllocation);
    if (!name) {
      toast.error("Enter client full name.");
      return;
    }
    if (Number.isNaN(cap) || cap < 0) {
      toast.error("Enter a valid capital allocation (≥ 0).");
      return;
    }
    if (!brokerClientId.trim()) {
      toast.error("Enter broker client ID.");
      return;
    }
    if (!brokerPin.trim()) {
      toast.error("Enter broker PIN.");
      return;
    }
    if (!totpSecret.trim()) {
      toast.error("Enter broker TOTP secret.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/clients/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ria_user_id: userId,
          client_name: name,
          capital_allocation: cap,
          broker: broker,
          client_id: brokerClientId.trim(),
          pin: brokerPin,
          totp_secret: totpSecret.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof data.detail === "string" ? data.detail : "Failed to add client";
        throw new Error(msg);
      }
      toast.success("Client added. Credentials are encrypted at rest.");
      setAddModalOpen(false);
      resetForm();
      fetchClients();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add client.");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFullName("");
    setCapitalAllocation("");
    setBroker("angelone");
    setBrokerClientId("");
    setBrokerPin("");
    setTotpSecret("");
  };

  const handleDelete = async (clientId: string) => {
    if (!userId) return;
    if (!confirm("Remove this client account? This cannot be undone.")) return;
    setDeletingId(clientId);
    try {
      const res = await fetch(
        `${API_BASE}/api/clients/${encodeURIComponent(clientId)}?user_id=${encodeURIComponent(userId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.detail === "string" ? data.detail : "Delete failed");
      }
      toast.success("Client removed.");
      fetchClients();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete client.");
    } finally {
      setDeletingId(null);
    }
  };

  const fmtCap = (n: number | string | undefined) => {
    const num = typeof n === "string" ? parseFloat(n) : n;
    return typeof num === "number" && !Number.isNaN(num)
      ? `₹${num.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
      : "—";
  };

  return (
    <MainLayout>
      <div className="p-4 md:p-6 max-w-7xl w-full mx-auto h-full overflow-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              Client Accounts
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage investor credentials and capital allocation. PINs and TOTP are encrypted at rest.
            </p>
          </div>
          <Button
            size="sm"
            className="btn-glow bg-gradient-to-r from-primary to-accent"
            onClick={() => setAddModalOpen(true)}
            disabled={!userId}
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Add New Client
          </Button>
        </div>

        <Card className="bg-card/80 border-border">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              Clients
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : !userId ? (
              <p className="text-xs text-muted-foreground">
                Sign in to view and manage client accounts.
              </p>
            ) : clients.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No client accounts yet. Click &quot;Add New Client&quot; to add one.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="text-xs text-muted-foreground">Client Name</TableHead>
                    <TableHead className="text-xs text-muted-foreground">Broker</TableHead>
                    <TableHead className="text-xs text-muted-foreground">Capital Allocated (₹)</TableHead>
                    <TableHead className="text-xs text-muted-foreground">Connection Status</TableHead>
                    <TableHead className="text-xs text-muted-foreground w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((c) => (
                    <TableRow key={c.id} className="border-border">
                      <TableCell className="text-sm text-foreground font-medium">
                        {c.client_name}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground capitalize">
                        {c.broker || "—"}
                      </TableCell>
                      <TableCell className="text-sm font-data">
                        {fmtCap(c.capital_allocation)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={c.status === "Active" ? "default" : "destructive"}
                          className={
                            c.status === "Active"
                              ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/40"
                              : "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/40"
                          }
                        >
                          {c.status === "Active" ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(c.id)}
                          disabled={deletingId === c.id}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Add Client Modal */}
        <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Client</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Client full name"
                  className="bg-background border-border"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="capital">Capital Allocation (₹)</Label>
                <Input
                  id="capital"
                  type="number"
                  min={0}
                  step={1000}
                  value={capitalAllocation}
                  onChange={(e) => setCapitalAllocation(e.target.value)}
                  placeholder="0"
                  className="bg-background border-border"
                />
              </div>
              <div className="space-y-2">
                <Label>Broker</Label>
                <Select value={broker} onValueChange={setBroker}>
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="angelone">Angel One</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="brokerClientId">Broker Client ID</Label>
                <Input
                  id="brokerClientId"
                  value={brokerClientId}
                  onChange={(e) => setBrokerClientId(e.target.value)}
                  placeholder="e.g. D1234567"
                  className="bg-background border-border"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pin">Broker PIN</Label>
                <Input
                  id="pin"
                  type="password"
                  value={brokerPin}
                  onChange={(e) => setBrokerPin(e.target.value)}
                  placeholder="Account PIN"
                  className="bg-background border-border"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="totp">Broker TOTP Secret</Label>
                <Input
                  id="totp"
                  type="password"
                  value={totpSecret}
                  onChange={(e) => setTotpSecret(e.target.value)}
                  placeholder="TOTP secret (from broker 2FA setup)"
                  className="bg-background border-border"
                  autoComplete="off"
                />
              </div>
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm text-foreground">
                <span className="font-medium">🔒 Security:</span> Client credentials are AES-256 encrypted at rest. Tradeky staff cannot access plain-text PINs or TOTP secrets.
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => { setAddModalOpen(false); resetForm(); }}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button onClick={handleAddClient} disabled={submitting}>
                {submitting ? "Adding…" : "Add Client"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
