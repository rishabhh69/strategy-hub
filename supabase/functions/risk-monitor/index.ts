import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface PortfolioData {
  peakValue: number;
  currentValue: number;
  entryPrice: number;
  currentPrice: number;
  positions: Array<{
    symbol: string;
    entryPrice: number;
    currentPrice: number;
    quantity: number;
    pnl: number;
  }>;
  drawdownThreshold: number; // e.g., 5 for 5%
  recentPrices: number[]; // Last N prices for trend analysis
}

interface RiskAnalysis {
  shouldExit: boolean;
  severity: "low" | "medium" | "high" | "critical";
  drawdownPercent: number;
  reason: string;
  recommendation: string;
  signals: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const portfolioData: PortfolioData = await req.json();
    
    // Calculate drawdown
    const drawdown = portfolioData.peakValue > 0 
      ? ((portfolioData.peakValue - portfolioData.currentValue) / portfolioData.peakValue) * 100
      : 0;
    
    const drawdownThreshold = portfolioData.drawdownThreshold || 5;
    const isDrawdownBreached = drawdown >= drawdownThreshold;
    
    // Prepare position summary for AI analysis
    const positionSummary = portfolioData.positions.map(p => ({
      symbol: p.symbol,
      pnlPercent: ((p.currentPrice - p.entryPrice) / p.entryPrice * 100).toFixed(2) + "%",
      pnl: p.pnl
    }));
    
    // Calculate price momentum from recent prices
    const pricesMomentum = portfolioData.recentPrices.length >= 2
      ? portfolioData.recentPrices[portfolioData.recentPrices.length - 1] - portfolioData.recentPrices[0]
      : 0;
    
    // Use AI to analyze the risk situation
    const aiPrompt = `You are a risk management AI for a trading system called "Greed System". Analyze this portfolio and provide a risk assessment.

PORTFOLIO DATA:
- Peak Value: ₹${portfolioData.peakValue.toLocaleString()}
- Current Value: ₹${portfolioData.currentValue.toLocaleString()}
- Current Drawdown: ${drawdown.toFixed(2)}%
- Drawdown Threshold: ${drawdownThreshold}%
- Threshold Breached: ${isDrawdownBreached ? "YES" : "NO"}
- Price Momentum (last ${portfolioData.recentPrices.length} ticks): ${pricesMomentum > 0 ? "+" : ""}${pricesMomentum.toFixed(2)}

POSITIONS:
${JSON.stringify(positionSummary, null, 2)}

Based on this data, provide a JSON response with:
1. shouldExit: boolean (true if positions should be closed to protect capital)
2. severity: "low" | "medium" | "high" | "critical"
3. reason: Brief explanation (max 50 words)
4. recommendation: Specific action to take (max 30 words)
5. signals: Array of 2-3 short warning signals detected

RULES:
- If drawdown exceeds threshold, ALWAYS recommend exit
- If multiple positions are losing, increase severity
- Consider momentum - accelerating losses are more critical
- Be decisive - capital preservation is priority

Respond ONLY with valid JSON, no markdown.`;

    const aiResponse = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "user",
            content: aiPrompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      throw new Error(`AI Gateway error: ${aiResponse.status} - ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || "";
    
    // Parse AI response
    let aiAnalysis;
    try {
      // Clean up potential markdown formatting
      const cleanedContent = aiContent.replace(/```json\n?|\n?```/g, "").trim();
      aiAnalysis = JSON.parse(cleanedContent);
    } catch {
      // Fallback to rule-based analysis if AI parsing fails
      aiAnalysis = {
        shouldExit: isDrawdownBreached,
        severity: drawdown >= drawdownThreshold * 1.5 ? "critical" : 
                  drawdown >= drawdownThreshold ? "high" : 
                  drawdown >= drawdownThreshold * 0.7 ? "medium" : "low",
        reason: isDrawdownBreached 
          ? `Drawdown of ${drawdown.toFixed(2)}% exceeds ${drawdownThreshold}% threshold`
          : "Portfolio within acceptable risk parameters",
        recommendation: isDrawdownBreached 
          ? "Exit all positions immediately to protect capital"
          : "Continue monitoring, no action required",
        signals: isDrawdownBreached 
          ? ["Drawdown threshold breached", "Capital at risk"]
          : ["Portfolio stable"],
      };
    }

    const riskAnalysis: RiskAnalysis = {
      shouldExit: aiAnalysis.shouldExit || isDrawdownBreached,
      severity: aiAnalysis.severity || "low",
      drawdownPercent: Math.round(drawdown * 100) / 100,
      reason: aiAnalysis.reason || "",
      recommendation: aiAnalysis.recommendation || "",
      signals: aiAnalysis.signals || [],
    };

    return new Response(
      JSON.stringify(riskAnalysis),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Risk monitor error:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        shouldExit: false,
        severity: "low",
        drawdownPercent: 0,
        reason: "Risk analysis temporarily unavailable",
        recommendation: "Monitor manually",
        signals: ["System error - manual oversight required"],
      }),
      {
        status: 200, // Return 200 with fallback data to not break the UI
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
