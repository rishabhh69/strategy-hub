import { User, Bell, Shield, CreditCard, Key, Palette, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { MainLayout } from "@/components/layout/MainLayout";

export default function Settings() {
  return (
    <MainLayout>
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your account preferences</p>
        </div>
        
        <div className="space-y-6">
          {/* Profile Section */}
          <div className="p-6 rounded-xl bg-card border border-border">
            <div className="flex items-center gap-3 mb-4">
              <User className="w-5 h-5 text-primary" />
              <h2 className="font-medium text-foreground">Profile</h2>
            </div>
            
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="username">Username</Label>
                <Input 
                  id="username" 
                  placeholder="Your username" 
                  defaultValue="trader_123"
                  className="bg-background border-border"
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="your@email.com"
                  defaultValue="trader@example.com"
                  className="bg-background border-border"
                />
              </div>
            </div>
          </div>
          
          {/* Notifications Section */}
          <div className="p-6 rounded-xl bg-card border border-border">
            <div className="flex items-center gap-3 mb-4">
              <Bell className="w-5 h-5 text-primary" />
              <h2 className="font-medium text-foreground">Notifications</h2>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Strategy Alerts</p>
                  <p className="text-xs text-muted-foreground">Get notified when strategies trigger</p>
                </div>
                <Switch defaultChecked />
              </div>
              
              <Separator className="bg-border" />
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Market Updates</p>
                  <p className="text-xs text-muted-foreground">Daily market summary emails</p>
                </div>
                <Switch defaultChecked />
              </div>
              
              <Separator className="bg-border" />
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Community Mentions</p>
                  <p className="text-xs text-muted-foreground">When someone mentions you</p>
                </div>
                <Switch />
              </div>
            </div>
          </div>
          
          {/* Subscription Section */}
          <div className="p-6 rounded-xl bg-card border border-border">
            <div className="flex items-center gap-3 mb-4">
              <CreditCard className="w-5 h-5 text-primary" />
              <h2 className="font-medium text-foreground">Subscription</h2>
            </div>
            
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border">
              <div>
                <p className="text-sm font-medium text-foreground">Free Plan</p>
                <p className="text-xs text-muted-foreground">Limited features and backtests</p>
              </div>
              <Button className="btn-glow bg-gradient-to-r from-primary to-accent">
                Upgrade to Pro
              </Button>
            </div>
          </div>
          
          {/* SEBI Verification */}
          <div className="p-6 rounded-xl bg-card border border-border">
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-5 h-5 text-gold" />
              <h2 className="font-medium text-foreground">SEBI Verification</h2>
            </div>
            
            <div className="p-4 rounded-lg bg-gold/5 border border-gold/20">
              <p className="text-sm text-foreground mb-2">Are you a SEBI Registered Investment Advisor?</p>
              <p className="text-xs text-muted-foreground mb-4">
                Get verified to access the Expert Lounge and add a gold badge to your strategies.
              </p>
              <Button variant="outline" className="border-gold text-gold hover:bg-gold/10">
                Apply for Verification
              </Button>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
