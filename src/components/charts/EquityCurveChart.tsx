import { useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const MAX_CHART_POINTS = 800;

interface ChartDataPoint {
  time?: string;
  value?: number;
}

interface EquityCurveChartProps {
  chartData?: ChartDataPoint[] | null;
}

function getPointTimeValue(point: unknown): { time: string; value: number } | null {
  if (point == null) return null;
  if (Array.isArray(point) && point.length >= 2) {
    const val = Number(point[1]);
    if (Number.isNaN(val)) return null;
    return { time: String(point[0]), value: val };
  }
  if (typeof point !== "object") return null;
  const p = point as Record<string, unknown>;
  const val = typeof p?.value === "number" && !Number.isNaN(p.value) ? p.value : Number(p?.value);
  if (Number.isNaN(val)) return null;
  const time = p?.time != null ? String(p.time) : "";
  return { time, value: val };
}

function sanitizeChartData(raw: unknown): { date: string; value: number; benchmark: number }[] {
  if (!raw || !Array.isArray(raw)) return [];
  const arr = raw as unknown[];
  if (arr.length === 0) return [];
  const step = arr.length <= MAX_CHART_POINTS ? 1 : Math.max(1, Math.ceil(arr.length / MAX_CHART_POINTS));
  const result: { date: string; value: number; benchmark: number }[] = [];
  for (let i = 0; i < arr.length; i += step) {
    const tv = getPointTimeValue(arr[i]);
    if (!tv) continue;
    const dateStr = tv.time ? new Date(tv.time).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : "";
    if (dateStr === "Invalid Date") continue;
    result.push({ date: dateStr || String(i), value: tv.value, benchmark: 100000 });
  }
  const lastTv = getPointTimeValue(arr[arr.length - 1]);
  if (lastTv && (result.length === 0 || result[result.length - 1].value !== lastTv.value)) {
    const dateStr = lastTv.time ? new Date(lastTv.time).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : "End";
    result.push({ date: dateStr === "Invalid Date" ? "End" : dateStr, value: lastTv.value, benchmark: 100000 });
  }
  return result;
}

export function EquityCurveChart({ chartData }: EquityCurveChartProps) {
  const data = useMemo(() => sanitizeChartData(chartData ?? null), [chartData]);
  const firstVal = data.length > 0 ? data[0].value : 0;
  const lastVal = data.length > 0 ? data[data.length - 1].value : 0;
  const isPositive = data.length > 0 && firstVal > 0 && lastVal > firstVal;
  const pctChange = data.length > 0 && firstVal > 0 ? ((lastVal / firstVal - 1) * 100) : 0;

  return (
    <div className="h-full w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">Equity Curve</h3>
          <div className="flex items-center gap-3 mt-1">
            <span className="font-data text-2xl text-foreground">
              {data.length > 0 ? `₹${Number(lastVal).toLocaleString("en-IN")}` : "₹0"}
            </span>
            {data.length > 0 && (
              <span className={`font-data text-sm ${isPositive ? "text-profit" : "text-loss"}`}>
                {pctChange >= 0 ? "+" : ""}{Number(pctChange).toFixed(2)}%
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
