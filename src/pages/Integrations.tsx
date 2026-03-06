import { useState } from "react";
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

interface BrokerCredentialRow {
  id: string;
  broker_name: string;
  status: "active" | "inactive";
  created_at: string;
}

const mockBrokers: BrokerCredentialRow[] = [
  {
    id: "1",
    broker_name: "Zerodha",
    status: "active",
    created_at: "2026-02-20",
  },
  {
    id: "2",
    broker_name: "Upstox",
    status: "inactive",
    created_at: "2026-01-15",
  },
];

export default function Integrations() {
  const [connecting, setConnecting] = useState(false);

  const handleConnectBroker = () => {
    setConnecting(true);
    // In real app this would kick off OAuth / API-key flow
    // For now, just log for debugging.
    // eslint-disable-next-line no-console
    console.log("Initiate Zerodha OAuth");
    setTimeout(() => setConnecting(false), 800);
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
            {connecting ? "Connecting…" : "Connect Broker"}
          </Button>
        </div>

        <Card className="bg-card/80 border-border">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              Connected Brokers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {mockBrokers.length === 0 ? (
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
                  {mockBrokers.map((b) => (
                    <TableRow key={b.id} className="border-border">
                      <TableCell className="text-sm text-foreground">
                        {b.broker_name}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={b.status === "active" ? "default" : "outline"}
                          className={b.status === "active" ? "bg-profit/20 text-profit border-profit/40" : ""}
                        >
                          {b.status === "active" ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {b.created_at}
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

