import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

// Mock equity curve data
const generateEquityCurve = () => {
  const data = [];
  let value = 100000;
  const startDate = new Date('2023-01-01');
  
  for (let i = 0; i < 365; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    
    // Random walk with slight upward bias
    const change = (Math.random() - 0.45) * 2000;
    value = Math.max(80000, value + change);
    
    data.push({
      date: date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
      value: Math.round(value),
      benchmark: 100000 + (i * 50) + (Math.random() - 0.5) * 1000,
    });
  }
  
  return data;
};

const data = generateEquityCurve();
const isPositive = data[data.length - 1].value > data[0].value;

export function EquityCurveChart() {
  return (
    <div className="h-full w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">Equity Curve</h3>
          <div className="flex items-center gap-3 mt-1">
            <span className="font-data text-2xl text-foreground">
              ₹{data[data.length - 1].value.toLocaleString('en-IN')}
            </span>
            <span className={`font-data text-sm ${isPositive ? 'text-profit' : 'text-loss'}`}>
              {isPositive ? '+' : ''}{((data[data.length - 1].value / data[0].value - 1) * 100).toFixed(2)}%
            </span>
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
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
