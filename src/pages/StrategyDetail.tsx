import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Shield, Users, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MainLayout } from "@/components/layout/MainLayout";
import { getStrategyById } from "@/data/strategyMockData";
import { EquityCurveChart } from "@/components/charts/EquityCurveChart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const riskColors = {
  low: "bg-profit/20 text-profit border-profit/30",
  medium: "bg-gold/20 text-gold border-gold/30",
  high: "bg-loss/20 text-loss border-loss/30",
};

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 text-center">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`font-data text-lg ${color || "text-foreground"}`}>{value}</p>
    </div>
  );
}

function MonthlyHeatmap({ data }: { data: { month: string; value: number }[] }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="text-sm font-medium text-muted-foreground mb-3">Monthly Returns</h3>
      <div className="grid grid-cols-3 gap-2">
        {data.map((m) => (
          <div
            key={m.month}
            className={`rounded-md p-2.5 text-center border ${
              m.value >= 0
                ? "bg-profit/10 border-profit/20"
                : "bg-loss/10 border-loss/20"
            }`}
          >
            <p className="text-[10px] text-muted-foreground">{m.month}</p>
            <p className={`font-data text-sm ${m.value >= 0 ? "text-profit" : "text-loss"}`}>
              {m.value >= 0 ? "+" : ""}{m.value.toFixed(1)}%
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StrategyDetail() {
  const { id } = useParams<{ id: string }>();
  const strategy = getStrategyById(id || "");

  if (!strategy) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <p className="text-muted-foreground mb-4">Strategy not found</p>
            <Button variant="outline" asChild>
              <Link to="/marketplace">Back to Marketplace</Link>
            </Button>
          </div>
        </div>
      </MainLayout>
    );
  }

  const equityChartData = strategy.equityCurve.map((p) => ({
    time: p.time,
    value: p.value,
  }));

  return (
    <MainLayout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        {/* Hero */}
        <div className="mb-6">
          <Button variant="ghost" size="sm" className="mb-4 text-muted-foreground" asChild>
            <Link to="/marketplace">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to Marketplace
            </Link>
          </Button>

          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex items-start gap-4">
              {/* Author avatar */}
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-foreground font-semibold text-sm flex-shrink-0">
                {strategy.author.avatar}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-semibold text-foreground">{strategy.title}</h1>
                  {strategy.author.isSebiVerified && (
                    <Badge className="badge-gold text-xs px-1.5 py-0 flex items-center gap-1">
                      <Shield className="w-3 h-3" /> SEBI Verified
                    </Badge>
                  )}
                  <Badge variant="outline" className={`${riskColors[strategy.riskScore]} border text-xs capitalize`}>
                    {strategy.riskScore} Risk
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  by {strategy.author.name} · <Users className="inline w-3 h-3 -mt-0.5" /> {strategy.subscribers.toLocaleString()} subscribers
                </p>
              </div>
            </div>

            <Button className="btn-glow bg-primary hover:bg-primary/90 text-sm px-6 flex-shrink-0">
              {strategy.price
                ? `Subscribe to Strategy (₹${strategy.price.toLocaleString("en-IN")}/mo)`
                : "Get Free Access"}
            </Button>
          </div>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
          {/* Left column */}
          <div className="space-y-6">
            {/* Equity Curve */}
            <div className="bg-card border border-border rounded-xl p-5">
              <EquityCurveChart chartData={equityChartData} />
            </div>

            {/* Strategy Logic */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Strategy Logic</h3>
              <p className="text-sm text-foreground/85 leading-relaxed">{strategy.longDescription}</p>
            </div>

            {/* Trade Log */}
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-muted-foreground">Last 5 Trades</h3>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Recent activity
                </span>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-xs text-muted-foreground">Symbol</TableHead>
                      <TableHead className="text-xs text-muted-foreground text-right">Entry</TableHead>
                      <TableHead className="text-xs text-muted-foreground text-right">Exit</TableHead>
                      <TableHead className="text-xs text-muted-foreground text-right">P&L</TableHead>
                      <TableHead className="text-xs text-muted-foreground text-right">Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {strategy.tradeLog.map((trade, i) => (
                      <TableRow key={i} className="border-border">
                        <TableCell className="font-data text-sm text-foreground">{trade.symbol}</TableCell>
                        <TableCell className="font-data text-sm text-foreground text-right">
                          ₹{trade.entryPrice.toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell className="font-data text-sm text-foreground text-right">
                          ₹{trade.exitPrice.toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell className={`font-data text-sm text-right ${trade.pnl >= 0 ? "text-profit" : "text-loss"}`}>
                          {trade.pnl >= 0 ? "+" : ""}₹{trade.pnl.toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground text-right">{trade.duration}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Performance Stats */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Max Drawdown" value={`${strategy.maxDrawdown}%`} color="text-loss" />
              <StatCard label="Win Rate" value={`${strategy.winRate}%`} color="text-profit" />
              <StatCard label="Profit Factor" value={strategy.profitFactor.toFixed(2)} />
              <StatCard label="Avg Risk/Reward" value={strategy.avgRiskReward} />
              <StatCard label="Total Trades" value={strategy.totalTrades.toLocaleString()} />
              <StatCard label="Sharpe Ratio" value={strategy.sharpeRatio.toFixed(2)} color="text-primary" />
            </div>

            {/* Monthly Heatmap */}
            <MonthlyHeatmap data={strategy.monthlyReturns} />

            {/* Quick Info */}
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">Quick Info</h3>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">CAGR</span>
                <span className="font-data text-profit">+{strategy.cagr}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Min. Capital</span>
                <span className="font-data text-foreground">₹{strategy.minCapital.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subscription</span>
                <span className="font-data text-foreground">
                  {strategy.price ? `₹${strategy.price.toLocaleString("en-IN")}/mo` : "Free"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Risk Level</span>
                <span className={`font-data capitalize ${
                  strategy.riskScore === "low" ? "text-profit" : strategy.riskScore === "high" ? "text-loss" : "text-gold"
                }`}>
                  {strategy.riskScore}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
