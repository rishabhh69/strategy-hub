import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  AlertTriangle, 
  Play, 
  Square, 
  Wallet, 
  BarChart3,
  Radio,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Zap
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

// Mock candlestick-style data for the chart
const generateChartData = () => {
  const data = [];
  let price = 22500;
  for (let i = 0; i < 60; i++) {
    const change = (Math.random() - 0.48) * 100;
    price += change;
    const time = `${9 + Math.floor(i / 12)}:${String((i % 12) * 5).padStart(2, '0')}`;
    data.push({
      time,
      price: Math.round(price * 100) / 100,
      volume: Math.floor(Math.random() * 50000) + 10000,
      open: price - change / 2,
      close: price + change / 2,
      high: price + Math.abs(change),
      low: price - Math.abs(change),
    });
  }
  return data;
};

const chartData = generateChartData();

// Mock running strategies
const runningStrategies = [
  {
    id: 1,
    name: "RSI Momentum Strategy",
    ticker: "NIFTY 50",
    status: "scanning",
    pnl: 45200,
    lastSignal: "Buy @ 9:45 AM",
    positions: 2,
  },
  {
    id: 2,
    name: "MACD Crossover",
    ticker: "BANKNIFTY",
    status: "holding",
    pnl: -12500,
    lastSignal: "Sell @ 10:15 AM",
    positions: 1,
  },
  {
    id: 3,
    name: "Mean Reversion",
    ticker: "RELIANCE",
    status: "scanning",
    pnl: 28750,
    lastSignal: "Hold",
    positions: 0,
  },
];

// Mock order log entries
const orderLog = [
  { time: "10:32:15", type: "signal", message: "Algo Triggered: BUY 50 Qty NIFTY 22500 CE" },
  { time: "10:32:17", type: "order", message: "Order Placed @ ₹245.50" },
  { time: "10:32:18", type: "fill", message: "Order Filled @ ₹245.75 (Slippage: ₹0.25)" },
  { time: "10:28:42", type: "signal", message: "Trailing Stop Updated: ₹22,450 → ₹22,520" },
  { time: "10:25:01", type: "info", message: "RSI crossed below 30 for BANKNIFTY" },
  { time: "10:15:33", type: "signal", message: "Algo Triggered: SELL 25 Qty BANKNIFTY FUT" },
  { time: "10:15:35", type: "fill", message: "Order Filled @ ₹48,250.00" },
  { time: "10:00:01", type: "info", message: "Market Open. All bots activated." },
  { time: "09:58:30", type: "system", message: "Pre-market scan complete. 3 opportunities identified." },
  { time: "09:45:12", type: "signal", message: "Algo Triggered: BUY 100 Qty RELIANCE" },
  { time: "09:45:15", type: "fill", message: "Order Filled @ ₹2,847.65" },
];

const getLogTypeColor = (type: string) => {
  switch (type) {
    case "signal": return "text-primary";
    case "order": return "text-accent";
    case "fill": return "text-profit";
    case "info": return "text-muted-foreground";
    case "system": return "text-gold";
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

export default function LiveTerminal() {
  const [selectedBot, setSelectedBot] = useState(runningStrategies[0]);
  
  const totalPnl = runningStrategies.reduce((acc, s) => acc + s.pnl, 0);
  const totalPositions = runningStrategies.reduce((acc, s) => acc + s.positions, 0);
  const netLiquidation = 10000000 + totalPnl;

  return (
    <MainLayout>
      <div className="flex flex-col h-full">
        {/* Terminal Header */}
        <div className="border-b border-border bg-card/50 px-6 py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {/* Net Liquidation */}
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Net Liquidation</div>
              <div className="text-2xl md:text-3xl font-bold font-data text-profit">
                ₹{netLiquidation.toLocaleString('en-IN')}
              </div>
            </div>
            
            {/* Day P&L */}
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Day P&L</div>
              <div className={`text-2xl md:text-3xl font-bold font-data flex items-center gap-2 ${totalPnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                {totalPnl >= 0 ? <ArrowUpRight className="w-6 h-6" /> : <ArrowDownRight className="w-6 h-6" />}
                {totalPnl >= 0 ? '+' : ''}₹{totalPnl.toLocaleString('en-IN')}
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
          {/* Left Column - Active Bots */}
          <div className="lg:col-span-3 flex flex-col gap-4 overflow-auto">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Running Strategies</h2>
              <Badge variant="outline" className="font-data">{runningStrategies.length}</Badge>
            </div>
            
            {runningStrategies.map((strategy) => (
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
                    <span className={`font-data font-medium ${strategy.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                      {strategy.pnl >= 0 ? '+' : ''}₹{strategy.pnl.toLocaleString('en-IN')}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    <span>{strategy.lastSignal}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
            
            {/* Control Buttons */}
            <div className="mt-auto space-y-2 pt-4 border-t border-border">
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" className="text-profit border-profit/30 hover:bg-profit/10">
                  <TrendingUp className="w-4 h-4 mr-1" />
                  Buy
                </Button>
                <Button variant="outline" size="sm" className="text-loss border-loss/30 hover:bg-loss/10">
                  <TrendingDown className="w-4 h-4 mr-1" />
                  Sell
                </Button>
              </div>
              <Button variant="destructive" size="sm" className="w-full">
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
                    <Badge variant="secondary" className="font-mono text-xs">1m</Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="font-data text-foreground">₹{chartData[chartData.length - 1].price.toLocaleString('en-IN')}</span>
                    <span className="text-profit font-data flex items-center gap-1">
                      <TrendingUp className="w-4 h-4" />
                      +0.42%
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 p-4">
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
                      tickFormatter={(v) => v.toLocaleString()}
                      width={60}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--popover))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px'
                      }}
                      labelStyle={{ color: 'hsl(var(--foreground))' }}
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
