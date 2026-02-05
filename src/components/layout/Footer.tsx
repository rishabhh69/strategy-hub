import { AlertTriangle } from "lucide-react";

export function Footer() {
  return (
    <footer className="sticky bottom-0 w-full bg-sidebar border-t border-border px-4 py-2">
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <AlertTriangle className="w-3 h-3 text-gold" />
        <span>
          Tradeky is a technology provider. All backtests are hypothetical. No investment advice provided.
        </span>
      </div>
    </footer>
  );
}
