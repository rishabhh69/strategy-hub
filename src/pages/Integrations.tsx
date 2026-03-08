import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlugZap, Key, Webhook, MessageSquare, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";

export default function Integrations() {
  return (
    <MainLayout>
      <div className="p-4 md:p-6 max-w-7xl w-full mx-auto h-full overflow-auto space-y-6">
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              Configure firm-wide integrations. To manage individual investor credentials, visit{" "}
              <Link to="/client-accounts" className="text-primary underline hover:no-underline">
                Client Accounts
              </Link>
              . To connect your own broker for executing strategies in Strategy Studio, go to{" "}
              <Link to="/settings" className="text-primary underline hover:no-underline">
                Settings → Broker Connection
              </Link>
              .
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <PlugZap className="w-5 h-5 text-primary" />
              Firm-Level Infrastructure
            </h1>
            <p className="text-sm text-muted-foreground">
              B2B tools and API configurations for your RIA practice.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card className="bg-card/80 border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                <Key className="w-4 h-4" />
                Master API Key (Angel One)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                Firm-level Angel One API key for server-to-server authentication. Used for order routing and market data.
              </p>
              <Button variant="outline" size="sm" disabled className="opacity-70">
                Configure (coming soon)
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-card/80 border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                <Webhook className="w-4 h-4" />
                TradingView Webhook Listener
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                Receive alerts from TradingView and trigger strategies or orders. Endpoint URL and secret.
              </p>
              <Button variant="outline" size="sm" disabled className="opacity-70">
                Configure (coming soon)
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-card/80 border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                <MessageSquare className="w-4 h-4" />
                Slack Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                Send trade confirmations, strategy signals, and risk alerts to a Slack channel.
              </p>
              <Button variant="outline" size="sm" disabled className="opacity-70">
                Configure (coming soon)
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
