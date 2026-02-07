import { AlertTriangle, Shield, Activity, TrendingDown, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface RiskAnalysis {
  shouldExit: boolean;
  severity: "low" | "medium" | "high" | "critical";
  drawdownPercent: number;
  reason: string;
  recommendation: string;
  signals: string[];
}

interface RiskMonitorPanelProps {
  riskAnalysis: RiskAnalysis | null;
  isAnalyzing: boolean;
  drawdownThreshold: number;
  onEmergencyExit: () => void;
}

const severityConfig = {
  low: {
    color: "text-profit",
    bgColor: "bg-profit/10",
    borderColor: "border-profit/30",
    label: "STABLE",
    icon: Shield,
  },
  medium: {
    color: "text-gold",
    bgColor: "bg-gold/10",
    borderColor: "border-gold/30",
    label: "CAUTION",
    icon: Activity,
  },
  high: {
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/30",
    label: "WARNING",
    icon: AlertTriangle,
  },
  critical: {
    color: "text-loss",
    bgColor: "bg-loss/10",
    borderColor: "border-loss/30",
    label: "CRITICAL",
    icon: TrendingDown,
  },
};

export function RiskMonitorPanel({
  riskAnalysis,
  isAnalyzing,
  drawdownThreshold,
  onEmergencyExit,
}: RiskMonitorPanelProps) {
  const severity = riskAnalysis?.severity || "low";
  const config = severityConfig[severity];
  const SeverityIcon = config.icon;
  const drawdownPercent = riskAnalysis?.drawdownPercent || 0;
  const drawdownProgress = Math.min((drawdownPercent / drawdownThreshold) * 100, 100);

  return (
    <Card className={cn("border-2 transition-all", config.borderColor, config.bgColor)}>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            Greed System Risk Monitor
            {isAnalyzing && (
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            )}
          </CardTitle>
          <Badge 
            variant="outline" 
            className={cn("font-mono text-xs", config.color, config.borderColor)}
          >
            <SeverityIcon className="w-3 h-3 mr-1" />
            {config.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pb-4">
        {/* Drawdown Meter */}
        <div>
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-muted-foreground">Drawdown</span>
            <span className={cn("font-data font-medium", drawdownPercent >= drawdownThreshold ? "text-loss" : "text-foreground")}>
              {drawdownPercent.toFixed(2)}% / {drawdownThreshold}%
            </span>
          </div>
          <Progress 
            value={drawdownProgress} 
            className={cn("h-2", drawdownPercent >= drawdownThreshold && "[&>div]:bg-loss")}
          />
        </div>

        {/* AI Analysis */}
        {riskAnalysis && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Analysis:</span>{" "}
              {riskAnalysis.reason}
            </div>
            
            {riskAnalysis.recommendation && (
              <div className="text-xs">
                <span className="font-medium text-primary">Recommendation:</span>{" "}
                <span className="text-foreground">{riskAnalysis.recommendation}</span>
              </div>
            )}

            {/* Warning Signals */}
            {riskAnalysis.signals.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {riskAnalysis.signals.map((signal, i) => (
                  <Badge key={i} variant="secondary" className="text-xs font-normal">
                    {signal}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Exit Button */}
        {riskAnalysis?.shouldExit && (
          <button
            onClick={onEmergencyExit}
            className="w-full py-2 px-4 bg-loss text-loss-foreground rounded-md font-semibold text-sm flex items-center justify-center gap-2 hover:bg-loss/90 transition-colors animate-pulse"
          >
            <AlertTriangle className="w-4 h-4" />
            EXIT ALL POSITIONS NOW
          </button>
        )}
      </CardContent>
    </Card>
  );
}
