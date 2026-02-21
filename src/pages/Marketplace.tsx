import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, Filter, Shield, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MainLayout } from "@/components/layout/MainLayout";
import { strategies, type StrategyDetail } from "@/data/strategyMockData";

const riskColors = {
  low: "bg-profit/20 text-profit border-profit/30",
  medium: "bg-gold/20 text-gold border-gold/30",
  high: "bg-loss/20 text-loss border-loss/30",
};

function StrategyCard({ strategy }: { strategy: StrategyDetail }) {
  return (
    <div className="card-glow bg-card rounded-xl p-5 flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-foreground truncate">{strategy.title}</h3>
            {strategy.author.isSebiVerified && (
              <Badge className="badge-gold text-xs px-1.5 py-0 flex items-center gap-1 flex-shrink-0">
                <Shield className="w-3 h-3" />
                SEBI
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">by {strategy.author.name}</p>
        </div>
        <Badge variant="outline" className={`${riskColors[strategy.riskScore]} border text-xs capitalize`}>
          {strategy.riskScore} Risk
        </Badge>
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground line-clamp-2 mb-4 flex-1">
        {strategy.description}
      </p>

      {/* Metrics - 4 columns */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="text-center p-2 rounded-lg bg-muted/50">
          <p className="text-[10px] text-muted-foreground mb-0.5">Sharpe</p>
          <p className="font-data text-sm text-foreground">{strategy.sharpeRatio.toFixed(2)}</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-muted/50">
          <p className="text-[10px] text-muted-foreground mb-0.5">CAGR</p>
          <p className="font-data text-sm text-profit">+{strategy.cagr}%</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-muted/50">
          <p className="text-[10px] text-muted-foreground mb-0.5">Win Rate</p>
          <p className="font-data text-sm text-foreground">{strategy.winRate}%</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-muted/50">
          <p className="text-[10px] text-muted-foreground mb-0.5">Min. Capital</p>
          <p className="font-data text-sm text-foreground">₹{(strategy.minCapital / 1000).toFixed(0)}k</p>
        </div>
      </div>

      {/* Subscribers count */}
      <div className="flex items-center justify-between mb-4 text-xs text-muted-foreground">
        <span>{strategy.subscribers.toLocaleString()} subscribers</span>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 text-sm" asChild>
          <Link to={`/marketplace/strategy/${strategy.id}`}>View Details</Link>
        </Button>
        <Button className="flex-1 text-sm bg-primary hover:bg-primary/90">
          {strategy.price ? `Subscribe - ₹${strategy.price.toLocaleString("en-IN")}/mo` : "Free Access"}
        </Button>
      </div>
    </div>
  );
}

export default function Marketplace() {
  const [searchQuery, setSearchQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [costFilter, setCostFilter] = useState<string>("all");

  const filteredStrategies = strategies.filter((strategy) => {
    const matchesSearch =
      strategy.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      strategy.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRisk = riskFilter === "all" || strategy.riskScore === riskFilter;
    const matchesCost =
      costFilter === "all" ||
      (costFilter === "free" && strategy.price === null) ||
      (costFilter === "under1000" && strategy.price !== null && strategy.price < 1000) ||
      (costFilter === "1000to2500" && strategy.price !== null && strategy.price >= 1000 && strategy.price <= 2500) ||
      (costFilter === "above2500" && strategy.price !== null && strategy.price > 2500);
    return matchesSearch && matchesRisk && matchesCost;
  });

  return (
    <MainLayout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto overflow-auto h-full">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-foreground">Strategy Marketplace</h1>
          <p className="text-sm text-muted-foreground">
            Discover and subscribe to proven trading strategies
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search strategies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-card border-border"
            />
          </div>
          <Select value={riskFilter} onValueChange={setRiskFilter}>
            <SelectTrigger className="w-full sm:w-[160px] bg-card border-border">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Risk Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Risks</SelectItem>
              <SelectItem value="low">Low Risk</SelectItem>
              <SelectItem value="medium">Medium Risk</SelectItem>
              <SelectItem value="high">High Risk</SelectItem>
            </SelectContent>
          </Select>
          <Select value={costFilter} onValueChange={setCostFilter}>
            <SelectTrigger className="w-full sm:w-[160px] bg-card border-border">
              <SelectValue placeholder="Price Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Prices</SelectItem>
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="under1000">Under ₹1,000</SelectItem>
              <SelectItem value="1000to2500">₹1,000 – ₹2,500</SelectItem>
              <SelectItem value="above2500">Above ₹2,500</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* SEBI Verified Banner */}
        <div className="mb-6 p-4 rounded-lg bg-gradient-to-r from-gold/10 to-gold/5 border border-gold/20">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-gold" />
            <div>
              <p className="text-sm font-medium text-foreground">SEBI Verified Advisors</p>
              <p className="text-xs text-muted-foreground">
                Strategies marked with gold badge are from SEBI Registered Investment Advisors
              </p>
            </div>
          </div>
        </div>

        {/* Strategy Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStrategies.map((strategy) => (
            <StrategyCard key={strategy.id} strategy={strategy} />
          ))}
        </div>

        {filteredStrategies.length === 0 && (
          <div className="text-center py-12">
            <TrendingUp className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground">No strategies found matching your criteria</p>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
