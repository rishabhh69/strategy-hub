import { User, Crown, Bell, Menu } from "lucide-react";
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

interface TopbarProps {
  onMenuClick?: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
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
            <div className="w-2 h-2 rounded-full bg-profit animate-pulse-glow" />
            <span className="text-xs font-mono text-muted-foreground">MARKETS OPEN</span>
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
              <DropdownMenuItem>Profile</DropdownMenuItem>
              <DropdownMenuItem>Settings</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Sign Out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
