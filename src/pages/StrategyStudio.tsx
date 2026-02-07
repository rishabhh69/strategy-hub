import { useState } from "react";
import { Play, ChevronDown, Code, BarChart3, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EquityCurveChart } from "@/components/charts/EquityCurveChart";
import { MetricsGrid } from "@/components/studio/MetricsGrid";
import { CodeViewer } from "@/components/studio/CodeViewer";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const tickers = [
  { value: "RELIANCE", label: "RELIANCE.NS" },
  { value: "TATAMOTORS", label: "TATAMOTORS.NS" },
  { value: "HDFCBANK", label: "HDFCBANK.NS" },
  { value: "TCS", label: "TCS.NS" },
];

interface BacktestResult {
  metrics: {
    cagr: number;
    drawdown: number;
    sharpe: number;
  };
  chart_data: Array<{
    time: string;
    value: number;
  }>;
  generated_code: string;
}

export default function StrategyStudio() {
  const [selectedTicker, setSelectedTicker] = useState("RELIANCE");
  const [strategyInput, setStrategyInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const handleRunBacktest = async () => {
    if (!strategyInput.trim()) return;
    
    setIsRunning(true);
    setError(null);
    setHasResults(false);
    
    // Get current user for logging
    const { data: { user } } = await supabase.auth.getUser();
    
    let sentimentLogId: string | null = null;

    try {
      // Log the backtest attempt to sentiment_logs (silently)
      if (user) {
        const { data: logData, error: logError } = await supabase
          .from("sentiment_logs")
          .insert({
            user_id: user.id,
            ticker: selectedTicker,
            prompt: strategyInput,
            result_summary: null,
          })
          .select("id")
          .single();

        if (!logError && logData) {
          sentimentLogId = logData.id;
        }
      }

      // Call Python backend
      const response = await fetch("http://127.0.0.1:8000/backtest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ticker: selectedTicker,
          prompt: strategyInput,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }
      
      const data: BacktestResult = await response.json();
      setBacktestResult(data);
      setHasResults(true);

      // Update the sentiment log with results (silently)
      if (sentimentLogId && user) {
        await supabase
          .from("sentiment_logs")
          .update({
            result_summary: {
              cagr: data.metrics.cagr,
              drawdown: data.metrics.drawdown,
              sharpe: data.metrics.sharpe,
            },
          })
          .eq("id", sentimentLogId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run backtest");
      setHasResults(false);
    } finally {
      setIsRunning(false);
    }
  };
  
  return (
    <MainLayout>
      <div className="flex flex-col h-full">
        {/* Strategy Studio Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border-b border-border">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Strategy Studio</h1>
            <p className="text-sm text-muted-foreground">Build and backtest trading strategies</p>
          </div>
          
          <div className="flex items-center gap-3">
            <Select value={selectedTicker} onValueChange={setSelectedTicker}>
              <SelectTrigger className="w-[180px] bg-card border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tickers.map((ticker) => (
                  <SelectItem key={ticker.value} value={ticker.value}>
                    <span className="font-mono">{ticker.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button 
              onClick={handleRunBacktest}
              disabled={!strategyInput.trim() || isRunning}
              className="btn-glow bg-gradient-to-r from-primary to-accent font-medium"
            >
              <Play className="w-4 h-4 mr-2" />
              {isRunning ? "Running..." : "Run Backtest"}
            </Button>
          </div>
        </div>
        
        {/* Split Pane IDE */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 min-h-0">
          {/* Left Pane - Strategy Input */}
          <div className="ide-pane flex flex-col">
            <div className="ide-header flex items-center gap-2">
              <Code className="w-4 h-4" />
              Strategy Input
            </div>
            <div className="flex-1 p-4 flex flex-col">
              <Textarea
                value={strategyInput}
                onChange={(e) => setStrategyInput(e.target.value)}
                placeholder={`Describe your strategy in plain English...

Examples:
• Buy when RSI < 30 and price is above 200 SMA
• Sell when MACD crosses below signal line
• Enter long when volume spikes 2x above average`}
                className="flex-1 min-h-[300px] resize-none bg-background border-border font-mono text-sm focus:ring-primary/50"
              />
              
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-profit animate-pulse-glow" />
                  <span>AI-Powered Analysis</span>
                </div>
                <span className="text-border">•</span>
                <span>Supports RSI, MACD, SMA, EMA, Bollinger Bands</span>
              </div>
            </div>
          </div>
          
          {/* Right Pane - Results */}
          <div className="ide-pane flex flex-col">
            <Tabs defaultValue="performance" className="flex-1 flex flex-col">
              <div className="ide-header">
                <TabsList className="bg-transparent h-auto p-0 gap-4">
                  <TabsTrigger 
                    value="performance" 
                    className="data-[state=active]:bg-muted data-[state=active]:text-foreground px-3 py-1.5 rounded-md"
                  >
                    <BarChart3 className="w-4 h-4 mr-2" />
                    Performance
                  </TabsTrigger>
                  <TabsTrigger 
                    value="metrics"
                    className="data-[state=active]:bg-muted data-[state=active]:text-foreground px-3 py-1.5 rounded-md"
                  >
                    <Calculator className="w-4 h-4 mr-2" />
                    Metrics
                  </TabsTrigger>
                  <TabsTrigger 
                    value="code"
                    className="data-[state=active]:bg-muted data-[state=active]:text-foreground px-3 py-1.5 rounded-md"
                  >
                    <Code className="w-4 h-4 mr-2" />
                    Code
                  </TabsTrigger>
                </TabsList>
              </div>
              
              <TabsContent value="performance" className="flex-1 m-0 p-4">
                {isRunning ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30 animate-pulse" />
                      <p className="text-sm">Loading...</p>
                    </div>
                  </div>
                ) : error ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm text-loss">{error}</p>
                    </div>
                  </div>
                ) : hasResults && backtestResult ? (
                  <EquityCurveChart chartData={backtestResult.chart_data} />
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">Run a backtest to see results</p>
                    </div>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="metrics" className="flex-1 m-0 p-4 overflow-auto">
                {isRunning ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <Calculator className="w-12 h-12 mx-auto mb-3 opacity-30 animate-pulse" />
                      <p className="text-sm">Loading...</p>
                    </div>
                  </div>
                ) : error ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <Calculator className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm text-loss">{error}</p>
                    </div>
                  </div>
                ) : hasResults && backtestResult ? (
                  <MetricsGrid metrics={backtestResult.metrics} />
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <Calculator className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">Run a backtest to see metrics</p>
                    </div>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="code" className="flex-1 m-0 overflow-hidden">
                {isRunning ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground p-4">
                    <div className="text-center">
                      <Code className="w-12 h-12 mx-auto mb-3 opacity-30 animate-pulse" />
                      <p className="text-sm">Loading...</p>
                    </div>
                  </div>
                ) : error ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground p-4">
                    <div className="text-center">
                      <Code className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm text-loss">{error}</p>
                    </div>
                  </div>
                ) : hasResults && backtestResult ? (
                  <CodeViewer code={backtestResult.generated_code} />
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground p-4">
                    <div className="text-center">
                      <Code className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">Run a backtest to see generated code</p>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
