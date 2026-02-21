import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import StrategyStudio from "./pages/StrategyStudio";
import Marketplace from "./pages/Marketplace";
import StrategyDetail from "./pages/StrategyDetail";
import Community from "./pages/Community";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import Auth from "./pages/Auth";
import LiveTerminal from "./pages/LiveTerminal";
import AboutUs from "./pages/AboutUs";
import Institutional from "./pages/Institutional";
import Careers from "./pages/Careers";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/strategy-studio" element={<StrategyStudio />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/marketplace/strategy/:id" element={<StrategyDetail />} />
          <Route path="/community" element={<Community />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/terminal" element={<LiveTerminal />} />
          <Route path="/live-terminal" element={<LiveTerminal />} />
          <Route path="/liveterminal" element={<Navigate to="/terminal" replace />} />
          <Route path="/LiveTerminal" element={<Navigate to="/terminal" replace />} />
          <Route path="/about" element={<AboutUs />} />
          <Route path="/institutional" element={<Institutional />} />
          <Route path="/careers" element={<Careers />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
