import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Zap, Database, Shield, ArrowRight, Code, Play } from "lucide-react";
import { TickerTape } from "@/components/layout/TickerTape";
import { supabase } from "@/integrations/supabase/client";

const GlassmorphismCard = () => (
  <div className="relative w-full max-w-md">
    {/* Gradient glow behind card */}
    <div className="absolute -inset-4 bg-gradient-to-r from-primary/30 via-accent/20 to-profit/30 blur-3xl opacity-60" />
    
    <div className="relative backdrop-blur-xl bg-card/40 border border-border-bright rounded-2xl p-6 shadow-2xl">
      {/* Input prompt */}
      <div className="mb-4">
        <div className="text-xs text-muted-foreground mb-2 font-mono">Strategy Input</div>
        <div className="bg-background/60 rounded-lg p-4 border border-border font-mono text-sm">
          <span className="text-muted-foreground">&gt;</span>{" "}
          <span className="text-foreground">Buy RELIANCE when RSI {"<"} 30 and volume spikes 2x</span>
          <span className="animate-pulse-glow text-primary">|</span>
        </div>
      </div>
      
      {/* Arrow transition */}
      <div className="flex justify-center my-4">
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
          <ArrowRight className="w-4 h-4 text-primary" />
        </div>
      </div>
      
      {/* Output chart preview */}
      <div className="bg-background/60 rounded-lg p-4 border border-border">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-muted-foreground font-mono">Equity Curve</span>
          <span className="text-profit font-data text-sm">+42.3% CAGR</span>
        </div>
        <div className="h-20 flex items-end gap-1">
          {[40, 45, 42, 55, 52, 65, 70, 68, 80, 85, 82, 95].map((height, i) => (
            <div 
              key={i}
              className="flex-1 bg-gradient-to-t from-profit/40 to-profit rounded-t"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  </div>
);

const FeatureCard = ({ 
  icon: Icon, 
  title, 
  description, 
  className = "" 
}: { 
  icon: React.ElementType; 
  title: string; 
  description: string;
  className?: string;
}) => (
  <div className={`group relative overflow-hidden rounded-2xl bg-card/50 backdrop-blur border border-border p-6 transition-all duration-300 hover:border-border-bright hover:bg-card/70 ${className}`}>
    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    <div className="relative">
      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
        <Icon className="w-6 h-6 text-primary" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  </div>
);

const StepCard = ({ 
  number, 
  title, 
  description, 
  code 
}: { 
  number: number; 
  title: string; 
  description: string; 
  code?: string;
}) => (
  <div className="relative">
    <div className="flex items-start gap-4">
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center font-data text-primary font-bold">
        {number}
      </div>
      <div className="flex-1">
        <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
        <p className="text-muted-foreground text-sm mb-3">{description}</p>
        {code && (
          <div className="bg-background/80 rounded-lg p-3 border border-border font-mono text-xs text-muted-foreground">
            {code}
          </div>
        )}
      </div>
    </div>
  </div>
);

export default function LandingPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authReady,  setAuthReady]  = useState(false);   // true once we know auth state
  const navigate = useNavigate();

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION immediately on mount — single source of truth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session);
      setAuthReady(true);
    });
    // Belt-and-suspenders: also call getSession in case the event fires late
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
      setAuthReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Ticker Tape */}
      <TickerTape />
      
      {/* Navigation */}
      <nav className="border-b border-border bg-background/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* Logo — always stays on landing page */}
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <img src="/logo.png" alt="Tradeky" className="w-8 h-8 rounded-lg object-contain" />
            <span className="text-xl font-bold text-foreground">Tradeky</span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <Link to="/marketplace" className="text-muted-foreground hover:text-foreground transition-colors">
              Marketplace
            </Link>
            <Link to="/terminal" className="text-muted-foreground hover:text-foreground transition-colors">
              Live Terminal
            </Link>
            <Link to="/community" className="text-muted-foreground hover:text-foreground transition-colors">
              Community
            </Link>
          </div>

          {/* Render nothing until we know auth state — prevents wrong buttons flashing */}
          {authReady && !isLoggedIn && (
            <div className="flex items-center gap-3">
              <Link to="/auth">
                <Button variant="ghost" size="sm">Log In</Button>
              </Link>
              <Link to="/auth">
                <Button size="sm" className="btn-glow">Get Started</Button>
              </Link>
            </div>
          )}

          {authReady && isLoggedIn && (
            <Link to="/strategy-studio">
              <Button size="sm" className="btn-glow">Go to Dashboard →</Button>
            </Link>
          )}

          {/* Skeleton placeholder while auth state loads */}
          {!authReady && (
            <div className="w-32 h-8 rounded-lg bg-muted/20 animate-pulse" />
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-24 lg:py-32">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-grid opacity-30" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[128px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/15 rounded-full blur-[128px]" />
        
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left content */}
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-6">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm text-primary font-medium">AI-Powered Trading</span>
              </div>
              
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground leading-tight mb-6">
                Algo Trading for Humans.{" "}
                <span className="text-gradient">No Code Required.</span>
              </h1>
              
              <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto lg:mx-0">
                Type your strategy in plain English. We generate the code, backtest it on 5 years of NSE data, and deploy it. Zero friction.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Link to="/strategy-studio">
                  <Button size="lg" className="btn-glow w-full sm:w-auto">
                    <Sparkles className="w-5 h-5 mr-2" />
                    Start Building (Free)
                  </Button>
                </Link>
                <Link to="/marketplace">
                  <Button size="lg" variant="outline" className="w-full sm:w-auto">
                    View Marketplace
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
              </div>
            </div>
            
            {/* Right visual */}
            <div className="flex justify-center lg:justify-end">
              <GlassmorphismCard />
            </div>
          </div>
        </div>
      </section>

      {/* Features Bento Grid */}
      <section className="py-24 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Built for Serious Traders
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Everything you need to go from idea to live execution, without writing a single line of code.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <FeatureCard 
              icon={Sparkles}
              title="Natural Language Engine"
              description="Describe your trading logic in plain English. Our AI understands RSI, MACD, moving averages, and 50+ technical indicators."
              className="lg:col-span-2"
            />
            <FeatureCard 
              icon={Zap}
              title="Instant Backtesting"
              description="Run simulations on 5+ years of tick-by-tick NSE data in under 30 seconds."
            />
            <FeatureCard 
              icon={Database}
              title="Institutional Grade Data"
              description="Access the same data feeds used by hedge funds and prop trading desks."
            />
            <FeatureCard 
              icon={Shield}
              title="SEBI Compliant Marketplace"
              description="Every strategy by verified advisors is vetted for regulatory compliance."
            />
            <FeatureCard 
              icon={Code}
              title="Transparent Code"
              description="See the exact Python code generated. Export it, modify it, run it anywhere."
              className="lg:col-span-2"
            />
            <FeatureCard 
              icon={Play}
              title="One-Click Deploy"
              description="Connect your broker and go live with paper or real capital in minutes."
            />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 bg-card/30 border-y border-border">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              From Idea to Execution in 3 Steps
            </h2>
            <p className="text-muted-foreground">
              The fastest path from strategy concept to live trading.
            </p>
          </div>
          
          <div className="space-y-12">
            <StepCard 
              number={1}
              title="Type Your Strategy"
              description="Describe what you want in plain English. No coding knowledge required."
              code='> "Buy Reliance when RSI < 30 and hold for 5 days"'
            />
            <div className="border-l-2 border-dashed border-border ml-5 h-8" />
            <StepCard 
              number={2}
              title="AI Generates Python"
              description="Our engine converts your intent into production-ready algorithmic trading code."
              code="def signal(data): return data['RSI'] < 30"
            />
            <div className="border-l-2 border-dashed border-border ml-5 h-8" />
            <StepCard 
              number={3}
              title="Simulate on Live Markets"
              description="Backtest on historical data, then paper trade on live feeds before risking capital."
            />
          </div>
          
          <div className="text-center mt-12">
            <Link to="/strategy-studio">
              <Button size="lg" className="btn-glow">
                Try It Now — Free
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-sidebar py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <img src="/logo.png" alt="Tradeky" className="w-8 h-8 rounded-lg object-contain" />
                <span className="text-xl font-bold text-foreground">Tradeky</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Institutional-grade algorithmic trading, accessible to everyone.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold text-foreground mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link to="/strategy-studio" className="hover:text-foreground transition-colors">Strategy Studio</Link></li>
                <li><Link to="/marketplace" className="hover:text-foreground transition-colors">Marketplace</Link></li>
                <li><Link to="/terminal" className="hover:text-foreground transition-colors">Live Terminal</Link></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold text-foreground mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link to="/about" className="hover:text-foreground transition-colors">About Us</Link></li>
                <li><Link to="/institutional" className="hover:text-foreground transition-colors">For Hedge Funds</Link></li>
                <li><Link to="/careers" className="hover:text-foreground transition-colors">Careers</Link></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold text-foreground mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Risk Disclosure</a></li>
              </ul>
            </div>
          </div>
          
          <div className="pt-8 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              © 2026 Tradeky Technologies Pvt. Ltd. All rights reserved.
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Shield className="w-3 h-3 text-gold" />
              Tradeky is a technology provider. All backtests are hypothetical. No investment advice provided.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
