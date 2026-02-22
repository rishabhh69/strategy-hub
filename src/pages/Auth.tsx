import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Mail, Lock, User, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

function ResendConfirmationButton({ email, callbackUrl }: { email: string; callbackUrl: string }) {
  const [loading, setLoading] = useState(false);
  const handleResend = async () => {
    if (!email) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: callbackUrl },
      });
      if (error) throw error;
      toast.success("Confirmation email sent again. Check your inbox and spam.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to resend email.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="w-full text-muted-foreground"
      onClick={handleResend}
      disabled={loading}
    >
      {loading ? (
        "Sending…"
      ) : (
        <>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Resend confirmation email
        </>
      )}
    </Button>
  );
}

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [signUpSuccess, setSignUpSuccess] = useState(false);
  const [signInUnconfirmed, setSignInUnconfirmed] = useState(false);
  const navigate = useNavigate();

  // Use VITE_APP_URL in production so the confirmation email link points to your app (set in Vercel env).
  // Add this exact URL to Supabase Dashboard → Authentication → URL Configuration → Redirect URLs.
  const appOrigin = import.meta.env.VITE_APP_URL || window.location.origin;
  const callbackUrl = `${appOrigin}/auth/callback`;

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSignUpSuccess(false);
    setSignInUnconfirmed(false);

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
        const user = data.user;
        const confirmed = user && !!(user.email_confirmed_at ?? (user as { confirmed_at?: string }).confirmed_at);
        if (user && !confirmed) {
          await supabase.auth.signOut();
          setSignInUnconfirmed(true);
          setLoading(false);
          return;
        }
        toast.success("Welcome back!");
        navigate("/strategy-studio");
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: callbackUrl,
            data: { username },
          },
        });

        if (error) throw error;
        // Always require email confirmation: sign out so they cannot enter until they click the email link.
        try {
          await supabase.auth.signOut();
        } catch {
          // Ignore signOut errors; still show "Check your email".
        }
        setSignUpSuccess(true);
        setLoading(false);
        return;
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="min-h-screen bg-background flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-sidebar via-background to-sidebar p-12 flex-col justify-between relative overflow-hidden">
        {/* Grid Background */}
        <div className="absolute inset-0 bg-grid opacity-30" />
        
        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <img src="/logo.png" alt="Tradeky" className="w-10 h-10 rounded-xl object-contain" />
          <span className="text-2xl font-semibold text-foreground">Tradeky</span>
        </div>
        
        {/* Hero Text */}
        <div className="relative z-10 space-y-6">
          <h1 className="text-4xl font-bold text-foreground leading-tight">
            Institutional Grade
            <br />
            <span className="text-gradient">Trading Intelligence</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-md">
            Build, backtest, and deploy algorithmic trading strategies with AI-powered analysis.
          </p>
          
          {/* Stats */}
          <div className="flex gap-8 pt-4">
            <div>
              <p className="font-data text-2xl text-profit">1.2M+</p>
              <p className="text-xs text-muted-foreground">Backtests Run</p>
            </div>
            <div>
              <p className="font-data text-2xl text-foreground">45K+</p>
              <p className="text-xs text-muted-foreground">Active Traders</p>
            </div>
            <div>
              <p className="font-data text-2xl text-gold">850+</p>
              <p className="text-xs text-muted-foreground">SEBI Advisors</p>
            </div>
          </div>
        </div>
        
        {/* Disclaimer */}
        <p className="relative z-10 text-xs text-muted-foreground">
          All backtests are hypothetical. Past performance does not guarantee future results.
        </p>
      </div>
      
      {/* Right Panel - Auth Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <img src="/logo.png" alt="Tradeky" className="w-10 h-10 rounded-xl object-contain" />
            <span className="text-2xl font-semibold text-foreground">Tradeky</span>
          </div>
          
          {/* Form Header */}
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-foreground">
              {signUpSuccess
                ? "Check your email"
                : signInUnconfirmed
                  ? "Confirm your email first"
                  : isLogin
                    ? "Welcome back"
                    : "Create account"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {signUpSuccess
                ? `We sent a confirmation link to ${email}. Click it to activate your account, then you’ll be redirected to Tradeky.`
                : signInUnconfirmed
                  ? "Your account is not activated yet. Click the confirmation link we sent to your email, then sign in again."
                  : isLogin
                    ? "Enter your credentials to access your account"
                    : "Start building strategies in minutes"}
            </p>
          </div>

          {(signUpSuccess || signInUnconfirmed) && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground text-center">
                {signUpSuccess
                  ? "You can close this page. After confirming, open Tradeky again and sign in."
                  : "After confirming, come back here and sign in."}
              </p>
              {signUpSuccess && (
                <>
                  <p className="text-[11px] text-muted-foreground/90 text-center">
                    Didn’t get the email? Check your spam folder, or resend below.
                  </p>
                  <ResendConfirmationButton email={email} callbackUrl={callbackUrl} />
                </>
              )}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setSignUpSuccess(false);
                  setSignInUnconfirmed(false);
                }}
              >
                Back to sign in
              </Button>
            </div>
          )}

          {!signUpSuccess && !signInUnconfirmed && (
          <>
          {/* Form */}
          <form onSubmit={handleAuth} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Choose a username"
                    className="pl-10 bg-card border-border"
                    required={!isLogin}
                  />
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="pl-10 bg-card border-border"
                  required
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-10 pr-10 bg-card border-border"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            
            <Button
              type="submit"
              disabled={loading}
              className="w-full btn-glow bg-gradient-to-r from-primary to-accent font-medium h-11"
            >
              {loading ? "Loading..." : isLogin ? "Sign In" : "Create Account"}
            </Button>
          </form>

          {/* Toggle */}
          <p className="text-center text-sm text-muted-foreground">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-primary hover:underline font-medium"
            >
              {isLogin ? "Sign up" : "Sign in"}
            </button>
          </p>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
