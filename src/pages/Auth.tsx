import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, TrendingUp, Mail, Lock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        
        if (error) throw error;
        toast.success("Welcome back!");
        navigate("/");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              username,
            },
          },
        });
        
        if (error) throw error;
        toast.success("Check your email to confirm your account!");
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
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-primary-foreground" />
          </div>
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
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-2xl font-semibold text-foreground">Tradeky</span>
          </div>
          
          {/* Form Header */}
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-foreground">
              {isLogin ? "Welcome back" : "Create account"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {isLogin 
                ? "Enter your credentials to access your account" 
                : "Start building strategies in minutes"}
            </p>
          </div>
          
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
        </div>
      </div>
    </div>
  );
}
