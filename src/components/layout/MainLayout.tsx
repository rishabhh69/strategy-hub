import { useState } from "react";
import { AppSidebar } from "./AppSidebar";
import { Topbar } from "./Topbar";
import { Footer } from "./Footer";

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop Sidebar — sticky so it never scrolls away */}
      <div className="hidden lg:block sticky top-0 h-screen shrink-0 self-start">
        <AppSidebar 
          collapsed={sidebarCollapsed} 
          onCollapse={() => setSidebarCollapsed(!sidebarCollapsed)} 
        />
      </div>
      
      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <>
          <div 
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 lg:hidden">
            <AppSidebar 
              collapsed={false} 
              onCollapse={() => setMobileMenuOpen(false)} 
            />
          </div>
        </>
      )}
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onMenuClick={() => setMobileMenuOpen(true)} />
        
        <main className="flex-1 overflow-auto flex flex-col">
          {children}
        </main>
        
        <Footer />
      </div>
    </div>
  );
}
