import { TrendingUp, TrendingDown, Activity, Target, AlertTriangle, Percent } from "lucide-react";

interface Metric {
  label: string;
  value: string;
  change?: number;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

interface MetricsGridProps {
  metrics?: {
    cagr: number;
    drawdown: number;
    sharpe: number;
  };
}

export function MetricsGrid({ metrics: providedMetrics }: MetricsGridProps) {
  // Use provided metrics or fallback to defaults
  const metrics: Metric[] = providedMetrics
    ? [
        {
          label: "CAGR",
          value: `${providedMetrics.cagr.toFixed(2)}%`,
          change: providedMetrics.cagr,
          icon: TrendingUp,
          description: "Compound Annual Growth Rate",
        },
        {
          label: "Max Drawdown",
          value: `${providedMetrics.drawdown.toFixed(2)}%`,
          change: providedMetrics.drawdown,
          icon: TrendingDown,
          description: "Maximum peak-to-trough decline",
        },
        {
          label: "Sharpe Ratio",
          value: providedMetrics.sharpe.toFixed(2),
          change: providedMetrics.sharpe,
          icon: Activity,
          description: "Risk-adjusted return metric",
        },
        {
          label: "Win Rate",
          value: "N/A",
          change: undefined,
          icon: Target,
          description: "Percentage of profitable trades",
        },
        {
          label: "Volatility",
          value: "N/A",
          change: undefined,
          icon: AlertTriangle,
          description: "Annualized standard deviation",
        },
        {
          label: "Sortino Ratio",
          value: "N/A",
          change: undefined,
          icon: Percent,
          description: "Downside risk-adjusted return",
        },
      ]
    : [
        {
          label: "CAGR",
          value: "24.7%",
          change: 24.7,
          icon: TrendingUp,
          description: "Compound Annual Growth Rate",
        },
        {
          label: "Max Drawdown",
          value: "-12.4%",
          change: -12.4,
          icon: TrendingDown,
          description: "Maximum peak-to-trough decline",
        },
        {
          label: "Sharpe Ratio",
          value: "1.82",
          change: 1.82,
          icon: Activity,
          description: "Risk-adjusted return metric",
        },
        {
          label: "Win Rate",
          value: "64.2%",
          change: 64.2,
          icon: Target,
          description: "Percentage of profitable trades",
        },
        {
          label: "Volatility",
          value: "18.3%",
          change: -18.3,
          icon: AlertTriangle,
          description: "Annualized standard deviation",
        },
        {
          label: "Sortino Ratio",
          value: "2.14",
          change: 2.14,
          icon: Percent,
          description: "Downside risk-adjusted return",
        },
      ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {metrics.map((metric) => {
        const isPositive = metric.change && metric.change > 0;
        const isNeutral = metric.label === "Volatility";
        
        return (
          <div 
            key={metric.label}
            className="p-4 rounded-lg bg-muted/50 border border-border hover:border-border-bright transition-colors"
          >
            <div className="flex items-start justify-between mb-2">
              <metric.icon className={`w-5 h-5 ${
                isNeutral ? 'text-gold' : isPositive ? 'text-profit' : 'text-loss'
              }`} />
            </div>
            
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{metric.label}</p>
              <p className={`font-data text-xl ${
                isNeutral ? 'text-foreground' : isPositive ? 'text-profit' : 'text-loss'
              }`}>
                {metric.value}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {metric.description}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
