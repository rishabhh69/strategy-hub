import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

interface ChartDataPoint {
  time: string;
  value: number;
}

interface EquityCurveChartProps {
  chartData?: ChartDataPoint[];
}

export function EquityCurveChart({ chartData }: EquityCurveChartProps) {
  // Transform chart data to match component format
  const data = chartData
    ? chartData.map((point) => ({
        date: new Date(point.time).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
        value: point.value,
        benchmark: 100000, // Simple benchmark, can be enhanced later
      }))
    : [];
  
  const isPositive = data.length > 0 && data[data.length - 1].value > data[0].value;
  return (
    <div className="h-full w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">Equity Curve</h3>
          <div className="flex items-center gap-3 mt-1">
            <span className="font-data text-2xl text-foreground">
              {data.length > 0 ? `₹${data[data.length - 1].value.toLocaleString('en-IN')}` : '₹0'}
            </span>
            {data.length > 0 && (
              <span className={`font-data text-sm ${isPositive ? 'text-profit' : 'text-loss'}`}>
                {isPositive ? '+' : ''}{((data[data.length - 1].value / data[0].value - 1) * 100).toFixed(2)}%
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-profit rounded" />
            <span className="text-muted-foreground">Strategy</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-muted-foreground rounded" />
            <span className="text-muted-foreground">Benchmark</span>
          </div>
        </div>
      </div>
      
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data.length > 0 ? data : []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(158, 64%, 40%)" stopOpacity={0.4} />
              <stop offset="95%" stopColor="hsl(158, 64%, 40%)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="lossGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0.4} />
              <stop offset="95%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          
          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke="hsl(217, 33%, 22%)" 
            vertical={false}
          />
          
          <XAxis 
            dataKey="date" 
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'hsl(215, 20%, 55%)', fontSize: 11 }}
            tickMargin={10}
            interval={60}
          />
          
          <YAxis 
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'hsl(215, 20%, 55%)', fontSize: 11 }}
            tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`}
            width={60}
          />
          
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(222, 47%, 10%)',
              border: '1px solid hsl(217, 33%, 22%)',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            labelStyle={{ color: 'hsl(215, 20%, 55%)' }}
            formatter={(value: number) => [`₹${value.toLocaleString('en-IN')}`, '']}
          />
          
          <Area
            type="monotone"
            dataKey="benchmark"
            stroke="hsl(215, 20%, 45%)"
            strokeWidth={1}
            fill="none"
            dot={false}
          />
          
          <Area
            type="monotone"
            dataKey="value"
            stroke={isPositive ? "hsl(158, 64%, 50%)" : "hsl(0, 84%, 60%)"}
            strokeWidth={2}
            fill={isPositive ? "url(#profitGradient)" : "url(#lossGradient)"}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
