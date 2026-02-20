import { User, Crown, Bell, Menu, LogOut } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TickerTape } from "./TickerTape";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TopbarProps {
  onMenuClick?: () => void;
}

function isNSEOpen(): boolean {
  const now       = new Date();
  const utcMs     = now.getTime() + now.getTimezoneOffset() * 60_000;
  const ist       = new Date(utcMs + 5.5 * 60 * 60_000);   // UTC+5:30
  const day       = ist.getDay();                            // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const mins = ist.getHours() * 60 + ist.getMinutes();
  return mins >= 555 && mins < 930;                          // 9:15–15:30 IST
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const navigate   = useNavigate();
  const [marketOpen, setMarketOpen] = useState(isNSEOpen());

  // Re-check every minute so the indicator flips automatically
  useEffect(() => {
    const id = setInterval(() => setMarketOpen(isNSEOpen()), 60_000);
    return () => clearInterval(id);
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out successfully");
    navigate("/auth");
  };

  return (
    <div className="flex flex-col border-b border-border">
      {/* Ticker Tape */}
      <TickerTape />
      
      {/* Main Topbar */}
      <div className="flex items-center justify-between px-4 h-14 bg-background">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            className="lg:hidden"
            onClick={onMenuClick}
          >
            <Menu className="w-5 h-5" />
          </Button>
          
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${marketOpen ? "bg-profit animate-pulse-glow" : "bg-muted-foreground"}`} />
            <span className={`text-xs font-mono ${marketOpen ? "text-profit" : "text-muted-foreground"}`}>
              {marketOpen ? "MARKETS OPEN" : "MARKET CLOSED"}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Upgrade Button */}
          <Button className="btn-glow bg-gradient-to-r from-primary to-accent hidden sm:flex">
            <Crown className="w-4 h-4 mr-2" />
            Upgrade to Pro
          </Button>
          
          {/* Notifications */}
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-loss" />
          </Button>
          
          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-2">
                <Avatar className="w-8 h-8 border border-border">
                  <AvatarFallback className="bg-muted text-muted-foreground text-sm">
                    <User className="w-4 h-4" />
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => navigate("/profile")}>
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/settings")}>
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-loss">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
