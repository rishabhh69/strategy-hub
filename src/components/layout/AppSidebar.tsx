import { 
  Beaker, 
  UserPlus, 
  Settings, 
  ChevronLeft,
  Monitor,
  Bookmark,
  PlugZap,
  Store,
  Users,
  Rocket,
} from "lucide-react";
import { NavLink, Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface AppSidebarProps {
  collapsed?: boolean;
  onCollapse?: () => void;
}

const navItems = [
  { 
    title: "Strategy Studio", 
    icon: Beaker, 
    path: "/strategy-studio",
    description: "Build & backtest"
  },
  { 
    title: "Client Accounts", 
    icon: UserPlus, 
    path: "/client-accounts",
    description: "RIA client CRM"
  },
  { 
    title: "Marketplace", 
    icon: Store, 
    path: "/marketplace",
    description: "Browse strategies"
  },
  { 
    title: "Community", 
    icon: Users, 
    path: "/community",
    description: "Discussion"
  },
  { 
    title: "Live Terminal", 
    icon: Monitor, 
    path: "/terminal",
    description: "Execute & monitor"
  },
  { 
    title: "Integrations", 
    icon: PlugZap, 
    path: "/integrations",
    description: "Firm infrastructure"
  },
  { 
    title: "Saved Strategies", 
    icon: Bookmark, 
    path: "/saved-strategies",
    description: "My library"
  },
  { 
    title: "Deployed Strategies", 
    icon: Rocket, 
    path: "/deployed-strategies",
    description: "Live deployments"
  },
  { 
    title: "Settings", 
    icon: Settings, 
    path: "/settings",
    description: "Preferences"
  },
];

export function AppSidebar({ collapsed, onCollapse }: AppSidebarProps) {
  const location = useLocation();
  
  return (
    <aside className={cn(
      "h-screen bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300",
      collapsed ? "w-16" : "w-64"
    )}>
      {/* Logo */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-sidebar-border">
        {!collapsed && (
          <Link
            to="/"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <img src="/logo.png" alt="Tradeky" className="w-8 h-8 rounded-lg object-contain" />
            <span className="font-semibold text-lg text-foreground">Tradeky</span>
          </Link>
        )}

        {collapsed && (
          <Link to="/" className="hover:opacity-80 transition-opacity">
            <img src="/logo.png" alt="Tradeky" className="w-8 h-8 rounded-lg object-contain mx-auto" />
          </Link>
        )}
        
        <Button
          variant="ghost"
          size="icon"
          onClick={onCollapse}
          className={cn(
            "hidden lg:flex h-8 w-8 text-muted-foreground hover:text-foreground",
            collapsed && "rotate-180"
          )}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                "text-sidebar-foreground hover:bg-sidebar-accent",
                isActive && "bg-sidebar-accent text-sidebar-accent-foreground border border-sidebar-border"
              )}
            >
              <item.icon className={cn(
                "w-5 h-5 flex-shrink-0",
                isActive && "text-primary"
              )} />
              
              {!collapsed && (
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium truncate">{item.title}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {item.description}
                  </span>
                </div>
              )}
            </NavLink>
          );
        })}
      </nav>
      
      {/* Version */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-sidebar-border">
          <span className="text-xs font-mono text-muted-foreground">v1.0.0-beta</span>
        </div>
      )}
    </aside>
  );
}
