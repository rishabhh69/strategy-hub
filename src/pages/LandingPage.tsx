import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Zap, Shield, ArrowRight } from "lucide-react";
import { TickerTape } from "@/components/layout/TickerTape";
import { supabase } from "@/integrations/supabase/client";

const TYPING_TEXT = "> Target: All Active Client Accounts... Executing parallel routing... 50/50 Orders Filled. Latency: 42ms.";

function TypingCodeBlock() {
  const [display, setDisplay] = useState("");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index >= TYPING_TEXT.length) {
      const t = setTimeout(() => setIndex(0), 3000);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setDisplay(TYPING_TEXT.slice(0, index + 1));
      setIndex((i) => i + 1);
    }, 45);
    return () => clearTimeout(t);
  }, [index]);

  return (
    <div className="relative w-full max-w-md">
      <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 via-accent/10 to-profit/20 blur-3xl opacity-50" />
      <div className="relative backdrop-blur-xl bg-card/40 border border-border-bright rounded-2xl p-6 shadow-2xl">
        <div className="text-xs text-muted-foreground mb-2 font-mono">Execution Log</div>
        <div className="bg-background/80 rounded-lg p-4 border border-border font-mono text-sm text-foreground min-h-[4.5rem]">
          <span className="text-profit">{display}</span>
          <span className="animate-pulse text-primary">|</span>
        </div>
      </div>
    </div>
  );
}

const FeatureCard = ({
  icon: Icon,
  title,
  description,
  className = "",
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  className?: string;
}) => (
  <div
    className={`group relative overflow-hidden rounded-2xl bg-card/50 backdrop-blur border border-border p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 hover:ring-1 hover:ring-primary/40 ${className}`}
  >
    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
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
              <Link to="/auth?mode=signup">
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
                <span className="text-sm text-primary font-medium">B2B Wealth Tech</span>
              </div>
              
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground leading-tight mb-6">
                Scale Your AUM.{" "}
                <span className="text-gradient">Not Your Headcount.</span>
              </h1>
              
              <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto lg:mx-0">
                The operating system for modern wealth managers. Translate plain-English strategies into simultaneous, concurrent order execution across all your clients&apos; broker accounts instantly.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Link to="/auth?mode=signup">
                  <Button size="lg" className="w-full sm:w-auto animate-pulse shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:animate-none">
                    Request Enterprise Demo
                  </Button>
                </Link>
                <a
                  href="#"
                  className="group/btn inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-transparent px-6 py-3 text-sm font-medium text-foreground hover:bg-muted/40 hover:border-border-bright transition-all duration-300"
                >
                  Read the Docs
                  <ArrowRight className="w-4 h-4 ml-1 transition-transform duration-300 group-hover/btn:translate-x-1" />
                </a>
              </div>
            </div>
            
            {/* Right visual — typing animation */}
            <div className="flex justify-center lg:justify-end">
              <TypingCodeBlock />
            </div>
          </div>
        </div>
      </section>

      {/* Trust & Infrastructure Banner */}
      <section className="relative border-y border-border/50 bg-card/20">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground/90">
            <span className="inline-flex items-center gap-2">🔒 Zero-Knowledge AES-256 Encryption</span>
            <span className="hidden sm:inline text-border">|</span>
            <span className="inline-flex items-center gap-2">⚡ Concurrent Multi-Account Routing</span>
            <span className="hidden sm:inline text-border">|</span>
            <span className="inline-flex items-center gap-2">🏦 SEBI-Compliant Architecture</span>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-24 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Institutional-Grade Execution, Deployed in Minutes.
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Enterprise infrastructure that scales with your AUM.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            <FeatureCard
              icon={Sparkles}
              title="Natural Language Compiler"
              description="Describe your firm's logic in plain English. Our proprietary engine compiles it into production-ready algorithmic routing."
            />
            <FeatureCard
              icon={Zap}
              title="Zero-Slippage Concurrency"
              description="Fire orders to 5 or 500 client accounts at the exact same millisecond using our asynchronous execution core."
            />
            <FeatureCard
              icon={Shield}
              title="Client Account CRM"
              description="Manage individual investor capital allocations and securely store encrypted broker credentials in a centralized, zero-knowledge vault."
            />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 bg-card/30 border-y border-border">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              From Strategy to Multi-Account Execution.
            </h2>
            <p className="text-muted-foreground">
              One workflow from firm logic to concurrent client execution.
            </p>
          </div>
          
          <div className="space-y-12">
            <StepCard
              number={1}
              title="Digitize Your Edge"
              description="Input your firm's proprietary trading logic without writing a single line of code."
            />
            <div className="border-l-2 border-dashed border-border ml-5 h-8" />
            <StepCard
              number={2}
              title="Allocate Client Capital"
              description="Select target portfolios. Our engine automatically calculates pro-rata position sizing based on each client's AUM."
            />
            <div className="border-l-2 border-dashed border-border ml-5 h-8" />
            <StepCard
              number={3}
              title="Deploy Concurrently"
              description="One click routes real-time signals to dozens of connected broker APIs simultaneously."
            />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-card/30 to-background" />
        <div className="relative max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Stop manually routing trades. Automate your RIA practice today.
          </h2>
          <p className="text-muted-foreground mb-8">
            Join wealth managers who scale execution without scaling headcount.
          </p>
          <Link to="/auth?mode=signup">
            <Button size="lg" className="btn-glow">
              Contact Sales for Pilot Access
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
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
