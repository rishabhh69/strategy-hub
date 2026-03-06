import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [connecting, setConnecting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [brokers, setBrokers] = useState<BrokerCredentialRow[]>([]);

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

  // Handle Zerodha redirect (?request_token=...)
  useEffect(() => {
    const handleCallback = async () => {
      const requestToken = searchParams.get("request_token");
      if (!requestToken) return;
      toast.info("Authenticating with Zerodha...");
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) {
          toast.error("You must be signed in to link your broker.");
          return;
        }
        const res = await fetch(`${API_BASE}/api/broker/zerodha/callback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request_token: requestToken, user_id: user.id }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const msg =
            typeof data.detail === "string"
              ? data.detail
              : `Zerodha callback failed (HTTP ${res.status})`;
          throw new Error(msg);
        }
        toast.success("Zerodha connected successfully.");
        // Clear request_token from URL
        searchParams.delete("request_token");
        setSearchParams(searchParams, { replace: true });
        // Refresh brokers table
        setLoading(true);
        await fetchBrokers();
      } catch (e) {
        console.error(e);
        toast.error(e instanceof Error ? e.message : "Zerodha authentication failed.");
      }
    };
    handleCallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleConnectBroker = async () => {
    try {
      setConnecting(true);
      const res = await fetch(`${API_BASE}/api/broker/zerodha/login-url`);
      if (!res.ok) {
        throw new Error(`Failed to get Zerodha login URL (HTTP ${res.status})`);
      }
      const data = await res.json();
      if (!data?.url) throw new Error("Backend did not return a login URL.");
      window.location.href = data.url as string;
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to start Zerodha OAuth.");
      setConnecting(false);
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
            disabled={connecting}
          >
            {connecting ? "Connecting…" : "Connect Angel One"}
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
      </div>
    </MainLayout>
  );
}

