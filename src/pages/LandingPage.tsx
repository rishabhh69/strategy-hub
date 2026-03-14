import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Zap, Shield, ArrowRight, Terminal, Store, Brain, Check, Users, Layers } from "lucide-react";
import { TickerTape } from "@/components/layout/TickerTape";
import { supabase } from "@/integrations/supabase/client";

const TYPING_LINES = [
  "> Compiling strategy...",
  "> NLP parsed.",
  "> Route: Live Terminal OR Multi-Account Broker.",
];
const TYPING_TEXT = TYPING_LINES.join(" ");

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

function GlassCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl p-6 transition-all duration-300 hover:-translate-y-2 hover:border-blue-500/40 hover:shadow-[0_0_40px_rgba(59,130,246,0.12)]">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/[0.04] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <div className="relative">
        <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mb-4 group-hover:bg-blue-500/20 group-hover:scale-105 transition-all duration-300">
          <Icon className="w-6 h-6 text-blue-400" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
        <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authReady,  setAuthReady]  = useState(false);

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
            {/* Community link commented out
            <Link to="/community" className="text-muted-foreground hover:text-foreground transition-colors">
              Community
            </Link>
            */}
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

      {/* ═══════════════ SECTION 1: GLOBAL HERO ═══════════════ */}
      <section className="relative overflow-hidden py-24 lg:py-36">
        <div className="absolute inset-0 bg-grid opacity-30" />
        <div className="absolute top-1/4 left-1/3 w-[32rem] h-[32rem] bg-blue-600/15 rounded-full blur-[160px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[128px]" />

        <div className="relative max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 mb-6">
                <Sparkles className="w-4 h-4 text-blue-400" />
                <span className="text-sm text-blue-400 font-medium">Dual-Sided Execution Platform</span>
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-[3.5rem] font-bold leading-tight mb-6">
                <span className="text-foreground">The Algorithmic Execution Engine for the </span>
                <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">Next Generation of Wealth.</span>
              </h1>

              <p className="text-lg text-muted-foreground mb-10 max-w-xl mx-auto lg:mx-0">
                Whether you manage ₹50 Crores or are building your first edge, Tradeky translates plain English into zero-latency live market execution.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <a href="#b2b" className="inline-block">
                  <Button size="lg" className="w-full sm:w-auto shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-shadow duration-300">
                    For Wealth Managers (RIAs)
                  </Button>
                </a>
                <a
                  href="#b2c"
                  className="group/btn inline-flex items-center justify-center gap-2 rounded-lg border border-blue-500/30 bg-transparent px-6 py-3 text-sm font-medium text-blue-400 hover:bg-blue-500/10 hover:border-blue-500/50 hover:shadow-[0_0_24px_rgba(59,130,246,0.15)] transition-all duration-300"
                >
                  For Independent Traders
                  <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover/btn:translate-x-1" />
                </a>
              </div>
            </div>

            <div className="flex justify-center lg:justify-end">
              <TypingCodeBlock />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ SECTION 2: CORE TECH MOAT ═══════════════ */}
      <section className="relative py-24 border-y border-white/[0.06]">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-card/20 to-background" />
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              <span className="bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent">Institutional Tech, Stripped of the Friction.</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              The core engine that powers both sides of the marketplace.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <GlassCard
              icon={Brain}
              title="Deterministic NLP Compiler"
              description="Type your logic in plain English. Our engine writes the Python, backtests it, and readies it for deployment instantly."
            />
            <GlassCard
              icon={Layers}
              title="Bifurcated Execution"
              description="Forward-test with zero risk on our Simulated Live Terminal, or deploy directly to your broker API for live market action."
            />
            <GlassCard
              icon={Shield}
              title="Greed AI Guardrails"
              description="Hard-coded risk management. Automatically enforce max-drawdowns and halt revenge trading before it hits the exchange."
            />
          </div>
        </div>
      </section>

      {/* ═══════════════ SECTION 3: B2B BLOCK ═══════════════ */}
      <section id="b2b" className="relative py-28 overflow-hidden scroll-mt-20">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(30,58,138,0.15)_0%,_transparent_60%)]" />
        <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-blue-900/10 rounded-full blur-[200px]" />

        <div className="relative max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 mb-6">
                <Users className="w-4 h-4 text-blue-400" />
                <span className="text-sm text-blue-400 font-medium">For Wealth Managers</span>
              </div>

              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4 leading-tight">
                For RIAs: Scale Your AUM,{" "}
                <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">Not Your Headcount.</span>
              </h2>
              <p className="text-muted-foreground mb-8">
                Purpose-built infrastructure for RIAs managing multiple client accounts through a single pane of glass.
              </p>

              <div className="space-y-5">
                {[
                  { title: "Concurrent Multi-Account Routing", text: "Fire trades to dozens of client Angel One accounts at the exact same millisecond." },
                  { title: "Zero-Knowledge Encrypted CRM", text: "Store client broker credentials securely with AES-256 encryption." },
                  { title: "Pro-Rata Position Sizing", text: "The engine automatically adjusts trade sizes based on individual client capital." },
                ].map((item) => (
                  <div key={item.title} className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center mt-0.5">
                      <Check className="w-3.5 h-3.5 text-blue-400" />
                    </div>
                    <div>
                      <span className="font-semibold text-foreground">{item.title}</span>
                      <p className="text-sm text-muted-foreground mt-0.5">{item.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: UI mockup placeholder */}
            <div className="relative flex items-center justify-center">
              <div className="absolute -inset-6 bg-gradient-to-br from-blue-500/10 via-transparent to-indigo-500/10 blur-3xl opacity-60" />
              <div className="relative w-full max-w-md rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl p-6 shadow-2xl">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                  <span className="ml-2 text-xs text-muted-foreground font-mono">multi_account_router.py</span>
                </div>
                <div className="bg-background/80 rounded-lg p-4 border border-border font-mono text-xs space-y-1.5">
                  <div><span className="text-blue-400">for</span> <span className="text-foreground">client</span> <span className="text-blue-400">in</span> <span className="text-foreground">active_clients:</span></div>
                  <div className="pl-4"><span className="text-muted-foreground">qty = pro_rata(client.capital)</span></div>
                  <div className="pl-4"><span className="text-green-400">place_order</span><span className="text-foreground">(client.broker, symbol, qty)</span></div>
                  <div className="mt-3 pt-3 border-t border-border text-green-400">✓ 47/47 orders filled — avg latency 38ms</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ SECTION 4: B2C BLOCK ═══════════════ */}
      <section id="b2c" className="relative py-28 bg-slate-950/60 border-y border-white/[0.06] scroll-mt-20">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(99,102,241,0.08)_0%,_transparent_60%)]" />

        <div className="relative max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 mb-6">
              <Terminal className="w-4 h-4 text-indigo-400" />
              <span className="text-sm text-indigo-400 font-medium">For Independent Traders</span>
            </div>

            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              For Retail: Code-Free Alpha and{" "}
              <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">Marketplace Access.</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Build, test, and deploy strategies without writing a single line of code — or subscribe to ones built by experts.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                num: 1,
                icon: Sparkles,
                title: "Build in the Strategy Studio",
                desc: "Use our NLP to create complex indicators (RSI, MACD) without knowing Python. Backtest instantly on historical data.",
                color: "indigo",
              },
              {
                num: 2,
                icon: Zap,
                title: "Connect Your Broker",
                desc: "Link your personal Angel One account for seamless, automated order routing — paper or live.",
                color: "violet",
              },
              {
                num: 3,
                icon: Store,
                title: "The Tradeky Marketplace",
                desc: "Don't want to build? Subscribe to SEBI-compliant strategies built by verified RIAs and auto-execute them on your account.",
                color: "purple",
              },
            ].map((step) => (
              <div
                key={step.num}
                className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl p-6 transition-all duration-300 hover:-translate-y-2 hover:border-indigo-500/40 hover:shadow-[0_0_40px_rgba(99,102,241,0.12)]"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.04] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-sm font-bold text-indigo-400">
                      {step.num}
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center group-hover:bg-indigo-500/20 group-hover:scale-105 transition-all duration-300">
                      <step.icon className="w-5 h-5 text-indigo-400" />
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">{step.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ SECTION 5: FINAL CTA ═══════════════ */}
      <section className="relative py-28 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-background to-background" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] bg-blue-600/[0.08] rounded-full blur-[200px]" />

        <div className="relative max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            <span className="text-foreground">Stop trading manually. </span>
            <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">Start executing like a machine.</span>
          </h2>
          <p className="text-muted-foreground mb-10 text-lg">
            Whether you are an RIA or a retail trader — the platform is the same, the edge is yours.
          </p>
          <Link to="/auth?mode=signup">
            <Button size="lg" className="shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-shadow duration-300 text-base px-8 py-6">
              Launch the Platform
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
