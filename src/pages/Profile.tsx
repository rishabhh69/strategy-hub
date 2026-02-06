import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { User, Mail, Calendar, Shield, Award, TrendingUp, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Profile {
  username: string | null;
  avatar_url: string | null;
  subscription_status: string | null;
  created_at: string;
}

interface UserRole {
  role: "admin" | "retail" | "sebi_verified";
  verified_at: string | null;
}

export default function Profile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate("/auth");
        return;
      }

      setEmail(user.email ?? null);

      const [profileResult, roleResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("username, avatar_url, subscription_status, created_at")
          .eq("user_id", user.id)
          .single(),
        supabase
          .from("user_roles")
          .select("role, verified_at")
          .eq("user_id", user.id)
          .single()
      ]);

      if (profileResult.data) {
        setProfile(profileResult.data);
      }

      if (roleResult.data) {
        setUserRole(roleResult.data);
      }

      setLoading(false);
    };

    fetchProfile();
  }, [navigate]);

  const getRoleBadge = () => {
    if (!userRole) return null;
    
    switch (userRole.role) {
      case "sebi_verified":
        return (
          <Badge className="bg-gold/20 text-gold border-gold/30">
            <Shield className="w-3 h-3 mr-1" />
            SEBI Verified
          </Badge>
        );
      case "admin":
        return (
          <Badge className="bg-primary/20 text-primary border-primary/30">
            <Award className="w-3 h-3 mr-1" />
            Admin
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-muted-foreground">
            Retail Trader
          </Badge>
        );
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-full">
          <div className="animate-pulse text-muted-foreground">Loading profile...</div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        {/* Profile Header */}
        <div className="p-8 rounded-2xl bg-gradient-to-br from-card via-card to-sidebar border border-border mb-6">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <Avatar className="w-24 h-24 border-2 border-primary/30">
              <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground text-2xl">
                {profile?.username?.[0]?.toUpperCase() || email?.[0]?.toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 text-center sm:text-left">
              <div className="flex flex-col sm:flex-row items-center gap-3 mb-2">
                <h1 className="text-2xl font-semibold text-foreground">
                  {profile?.username || "Unnamed Trader"}
                </h1>
                {getRoleBadge()}
              </div>
              
              <p className="text-muted-foreground flex items-center justify-center sm:justify-start gap-2">
                <Mail className="w-4 h-4" />
                {email}
              </p>
              
              <p className="text-sm text-muted-foreground flex items-center justify-center sm:justify-start gap-2 mt-1">
                <Calendar className="w-4 h-4" />
                Member since {profile?.created_at ? new Date(profile.created_at).toLocaleDateString("en-IN", {
                  year: "numeric",
                  month: "long"
                }) : "Unknown"}
              </p>
            </div>
            
            <Button 
              variant="outline" 
              onClick={() => navigate("/settings")}
              className="gap-2"
            >
              <Edit2 className="w-4 h-4" />
              Edit Profile
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="p-6 rounded-xl bg-card border border-border">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-data font-semibold text-foreground">0</p>
                <p className="text-xs text-muted-foreground">Strategies Created</p>
              </div>
            </div>
          </div>
          
          <div className="p-6 rounded-xl bg-card border border-border">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-profit/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-profit" />
              </div>
              <div>
                <p className="text-2xl font-data font-semibold text-foreground">0</p>
                <p className="text-xs text-muted-foreground">Backtests Run</p>
              </div>
            </div>
          </div>
          
          <div className="p-6 rounded-xl bg-card border border-border">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center">
                <Award className="w-5 h-5 text-gold" />
              </div>
              <div>
                <p className="text-2xl font-data font-semibold text-foreground capitalize">
                  {profile?.subscription_status || "Free"}
                </p>
                <p className="text-xs text-muted-foreground">Current Plan</p>
              </div>
            </div>
          </div>
        </div>

        {/* Subscription Status */}
        <div className="p-6 rounded-xl bg-card border border-border">
          <h2 className="font-medium text-foreground mb-4">Subscription</h2>
          
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border">
            <div>
              <p className="font-medium text-foreground capitalize">
                {profile?.subscription_status || "Free"} Plan
              </p>
              <p className="text-sm text-muted-foreground">
                {profile?.subscription_status === "pro" 
                  ? "Unlimited backtests and premium features"
                  : "Limited features and backtests"}
              </p>
            </div>
            {profile?.subscription_status !== "pro" && (
              <Button className="btn-glow bg-gradient-to-r from-primary to-accent">
                Upgrade to Pro
              </Button>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
