import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  AlertTriangle, 
  Square, 
  Radio,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Zap,
  RefreshCw
} from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  ComposedChart,
  Bar
} from "recharts";
import { useLiveMarketData, useRiskMonitor } from "@/hooks/use-live-market-data";
import { RiskMonitorPanel } from "@/components/terminal/RiskMonitorPanel";
import { toast } from "sonner";

// Strategy definitions - "Greed System" is the main one
const runningStrategies = [
  {
    id: 1,
    name: "Greed System",
    ticker: "RELIANCE",
    symbol: "RELIANCE.NS",
    status: "scanning",
    entryPrice: 2800,
    quantity: 100,
  },
  {
    id: 2,
    name: "MACD Crossover",
    ticker: "TATAMOTORS",
    symbol: "TATAMOTORS.NS",
    status: "holding",
    entryPrice: 750,
    quantity: 50,
  },
  {
    id: 3,
    name: "Mean Reversion",
    ticker: "TCS",
    symbol: "TCS.NS",
    status: "scanning",
    entryPrice: 4200,
    quantity: 25,
  },
];

const getLogTypeColor = (type: string) => {
  switch (type) {
    case "signal": return "text-primary";
    case "order": return "text-accent";
    case "fill": return "text-profit";
    case "info": return "text-muted-foreground";
    case "system": return "text-gold";
    case "risk": return "text-loss";
    default: return "text-foreground";
  }
};

const StatusBadge = ({ status }: { status: string }) => {
  const config: Record<string, { variant: "default" | "secondary" | "outline"; icon: React.ReactNode }> = {
    scanning: { variant: "default", icon: <Radio className="w-3 h-3 animate-pulse" /> },
    holding: { variant: "secondary", icon: <Activity className="w-3 h-3" /> },
    stopped: { variant: "outline", icon: <Square className="w-3 h-3" /> },
  };
  
  const { variant, icon } = config[status] || config.scanning;
  
  return (
    <Badge variant={variant} className="gap-1 capitalize">
      {icon}
      {status}
    </Badge>
  );
};

interface OrderLogEntry {
  time: string;
  type: string;
  message: string;
}

export default function LiveTerminal() {
  const [selectedBot, setSelectedBot] = useState(runningStrategies[0]);
  const [orderLog, setOrderLog] = useState<OrderLogEntry[]>([
    { time: "09:15:00", type: "system", message: "Market Open. Greed System activated." },
  ]);
  const [peakPortfolioValue, setPeakPortfolioValue] = useState(10000000);
  const [drawdownThreshold] = useState(5); // 5% drawdown threshold
  const [isMonitoringEnabled, setIsMonitoringEnabled] = useState(true);
  const priceHistoryRef = useRef<number[]>([]);
  
  // Live market data for selected bot
  const { quote, chartData, isLoading, error, lastUpdated, refetch } = useLiveMarketData(
    selectedBot.symbol,
    5000 // Poll every 5 seconds
  );

  // Calculate positions with live prices
  const positions = runningStrategies.map(s => {
    const currentPrice = s.id === selectedBot.id && quote ? quote.price : s.entryPrice * 1.02;
    const pnl = (currentPrice - s.entryPrice) * s.quantity;
    return {
      symbol: s.symbol,
      entryPrice: s.entryPrice,
      currentPrice,
      quantity: s.quantity,
      pnl,
    };
  });

  const totalPnl = positions.reduce((acc, p) => acc + p.pnl, 0);
  const portfolioValue = 10000000 + totalPnl;
  const totalPositions = positions.filter(p => p.quantity > 0).length;

  // Track peak value
  useEffect(() => {
    if (portfolioValue > peakPortfolioValue) {
      setPeakPortfolioValue(portfolioValue);
    }
  }, [portfolioValue, peakPortfolioValue]);

  // Track recent prices for momentum
  useEffect(() => {
    if (quote?.price) {
      priceHistoryRef.current = [...priceHistoryRef.current.slice(-20), quote.price];
    }
  }, [quote?.price]);

  // ML Risk Monitor
  const { riskAnalysis, isAnalyzing } = useRiskMonitor(
    portfolioValue,
    peakPortfolioValue,
    positions,
    priceHistoryRef.current,
    drawdownThreshold,
    isMonitoringEnabled
  );

  // Add log entries for events
  const addLogEntry = (type: string, message: string) => {
    const now = new Date();
    const time = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setOrderLog(prev => [{ time, type, message }, ...prev.slice(0, 49)]);
  };

  // Log risk alerts
  useEffect(() => {
    if (riskAnalysis?.shouldExit) {
      addLogEntry("risk", `🚨 RISK ALERT: ${riskAnalysis.reason}`);
    }
  }, [riskAnalysis?.shouldExit]);

  // Log price updates periodically
  useEffect(() => {
    if (quote && !isLoading) {
      const changeIcon = quote.changePercent >= 0 ? "📈" : "📉";
      addLogEntry("info", `${changeIcon} ${selectedBot.ticker} @ ₹${quote.price.toFixed(2)} (${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent.toFixed(2)}%)`);
    }
  }, [quote?.timestamp]);

  const handleEmergencyExit = () => {
    addLogEntry("risk", "🛑 EMERGENCY EXIT: All positions closed by Greed System");
    toast.success("All positions closed", { description: "Emergency exit executed successfully" });
    setIsMonitoringEnabled(false);
  };

  const handleManualBuy = () => {
    addLogEntry("order", `Manual BUY order: 10 Qty ${selectedBot.ticker} @ ₹${quote?.price.toFixed(2) || 'Market'}`);
    addLogEntry("fill", `Order Filled @ ₹${quote?.price.toFixed(2) || 'Market'}`);
    toast.success("Buy order executed");
  };

  const handleManualSell = () => {
    addLogEntry("order", `Manual SELL order: 10 Qty ${selectedBot.ticker} @ ₹${quote?.price.toFixed(2) || 'Market'}`);
    addLogEntry("fill", `Order Filled @ ₹${quote?.price.toFixed(2) || 'Market'}`);
    toast.success("Sell order executed");
  };

  return (
    <MainLayout>
      <div className="flex flex-col h-full">
        {/* Terminal Header */}
        <div className="border-b border-border bg-card/50 px-6 py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {/* Net Liquidation */}
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Net Liquidation</div>
              <div className={`text-2xl md:text-3xl font-bold font-data ${totalPnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                ₹{portfolioValue.toLocaleString('en-IN')}
              </div>
            </div>
            
            {/* Day P&L */}
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Day P&L</div>
              <div className={`text-2xl md:text-3xl font-bold font-data flex items-center gap-2 ${totalPnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                {totalPnl >= 0 ? <ArrowUpRight className="w-6 h-6" /> : <ArrowDownRight className="w-6 h-6" />}
                {totalPnl >= 0 ? '+' : ''}₹{Math.abs(totalPnl).toLocaleString('en-IN')}
              </div>
            </div>
            
            {/* Open Positions */}
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Open Positions</div>
              <div className="text-2xl md:text-3xl font-bold font-data text-foreground">
                {totalPositions}
              </div>
            </div>
            
            {/* Active Bots */}
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Active Bots</div>
              <div className="text-2xl md:text-3xl font-bold font-data text-foreground flex items-center gap-2">
                {runningStrategies.length}
                <span className="w-2 h-2 rounded-full bg-profit animate-pulse-glow" />
              </div>
            </div>
          </div>
        </div>

        {/* Main 3-Column Layout */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 overflow-hidden">
          {/* Left Column - Active Bots + Risk Monitor */}
          <div className="lg:col-span-3 flex flex-col gap-4 overflow-auto">
            {/* Risk Monitor Panel */}
            <RiskMonitorPanel
              riskAnalysis={riskAnalysis}
              isAnalyzing={isAnalyzing}
              drawdownThreshold={drawdownThreshold}
              onEmergencyExit={handleEmergencyExit}
            />

            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Running Strategies</h2>
              <Badge variant="outline" className="font-data">{runningStrategies.length}</Badge>
            </div>
            
            {runningStrategies.map((strategy, i) => {
              const position = positions[i];
              return (
                <Card 
                  key={strategy.id} 
                  className={`cursor-pointer transition-all ${selectedBot.id === strategy.id ? 'border-primary bg-primary/5' : 'hover:border-border-bright'}`}
                  onClick={() => setSelectedBot(strategy)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-medium text-foreground text-sm">{strategy.name}</h3>
                        <p className="text-xs text-muted-foreground font-mono">{strategy.ticker}</p>
                      </div>
                      <StatusBadge status={strategy.status} />
                    </div>
                    
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">P&L</span>
                      <span className={`font-data font-medium ${position.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                        {position.pnl >= 0 ? '+' : ''}₹{position.pnl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>Entry @ ₹{strategy.entryPrice}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            
            {/* Control Buttons */}
            <div className="mt-auto space-y-2 pt-4 border-t border-border">
              <div className="grid grid-cols-2 gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="text-profit border-profit/30 hover:bg-profit/10"
                  onClick={handleManualBuy}
                >
                  <TrendingUp className="w-4 h-4 mr-1" />
                  Buy
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="text-loss border-loss/30 hover:bg-loss/10"
                  onClick={handleManualSell}
                >
                  <TrendingDown className="w-4 h-4 mr-1" />
                  Sell
                </Button>
              </div>
              <Button 
                variant="destructive" 
                size="sm" 
                className="w-full"
                onClick={handleEmergencyExit}
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                Emergency Stop All
              </Button>
            </div>
          </div>

          {/* Middle Column - Chart */}
          <div className="lg:col-span-6 flex flex-col">
            <Card className="flex-1 flex flex-col">
              <CardHeader className="py-3 px-4 border-b border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base font-medium">{selectedBot.ticker}</CardTitle>
                    <Badge variant="secondary" className="font-mono text-xs">LIVE</Badge>
                    {error && <Badge variant="destructive" className="text-xs">Error</Badge>}
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <button 
                      onClick={refetch} 
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      disabled={isLoading}
                    >
                      <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                    <span className="font-data text-foreground">
                      {quote 
                        ? `₹${quote.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : isLoading 
                          ? "Loading..."
                          : "—"
                      }
                    </span>
                    {quote && (
                      <span className={`font-data flex items-center gap-1 ${quote.changePercent >= 0 ? 'text-profit' : 'text-loss'}`}>
                        {quote.changePercent >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        {quote.changePercent >= 0 ? '+' : ''}{quote.changePercent.toFixed(2)}%
                      </span>
                    )}
                  </div>
                </div>
                {lastUpdated && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Last updated: {lastUpdated.toLocaleTimeString()}
                  </div>
                )}
              </CardHeader>
              <CardContent className="flex-1 p-4">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData}>
                      <defs>
                        <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid 
                        strokeDasharray="3 3" 
                        stroke="hsl(var(--border))" 
                        vertical={false}
                      />
                      <XAxis 
                        dataKey="time" 
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                        interval="preserveStartEnd"
                      />
                      <YAxis 
                        domain={['auto', 'auto']}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                        tickFormatter={(v) => `₹${v.toLocaleString()}`}
                        width={70}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--popover))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          fontSize: '12px'
                        }}
                        labelStyle={{ color: 'hsl(var(--foreground))' }}
                        formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Price']}
                      />
                      <Bar 
                        dataKey="volume" 
                        fill="hsl(var(--muted))" 
                        opacity={0.3}
                        yAxisId="volume"
                      />
                      <YAxis yAxisId="volume" orientation="right" hide />
                      <Area 
                        type="monotone" 
                        dataKey="price" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={2}
                        fill="url(#priceGradient)" 
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      {isLoading ? (
                        <>
                          <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin" />
                          <p className="text-sm">Loading live data...</p>
                        </>
                      ) : error ? (
                        <>
                          <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-loss" />
                          <p className="text-sm text-loss">{error}</p>
                          <p className="text-xs mt-1">Market may be closed</p>
                        </>
                      ) : (
                        <p className="text-sm">No chart data available</p>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Order Log */}
          <div className="lg:col-span-3 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Order Log</h2>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Zap className="w-3 h-3 text-profit" />
                Live
              </div>
            </div>
            
            <Card className="flex-1 overflow-hidden">
              <CardContent className="p-0 h-full overflow-auto">
                <div className="divide-y divide-border">
                  {orderLog.map((log, index) => (
                    <div key={index} className="px-3 py-2 hover:bg-muted/30 transition-colors">
                      <div className="flex items-start gap-2">
                        <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                          [{log.time}]
                        </span>
                        <span className={`text-xs font-mono ${getLogTypeColor(log.type)}`}>
                          {log.message}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
