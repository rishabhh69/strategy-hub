import { Server, Lock, Waypoints, ArrowRight } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    icon: Server,
    title: "Dedicated Execution Nodes",
    description:
      "Isolated AWS Fargate environments for zero-contention processing.",
  },
  {
    icon: Lock,
    title: "Private Strategy Studio",
    description:
      "Bring your own OpenAI/Anthropic API keys for fully encrypted, IP-protected strategy generation.",
  },
  {
    icon: Waypoints,
    title: "Broker API Aggregation",
    description:
      "Route orders seamlessly across multiple institutional brokers through a single, unified WebSocket connection.",
  },
];

export default function Institutional() {
  return (
    <MainLayout>
      <div className="flex-1 overflow-y-auto">
        {/* Subtle glow background */}
        <div className="relative">
          <div className="absolute inset-0 bg-primary/5 pointer-events-none" />

          {/* Hero */}
          <section className="relative max-w-3xl mx-auto text-center py-20 px-6">
            <Badge variant="outline" className="mb-4 text-primary border-primary/30">
              Tradeky Enterprise
            </Badge>
            <h1 className="text-4xl font-bold text-foreground mb-6 leading-tight">
              Institutional Infrastructure for Modern Quants.
            </h1>
            <p className="text-muted-foreground text-lg leading-relaxed">
              Scale your firm's alpha with Tradeky's enterprise-grade
              architecture. Deploy proprietary strategies across multiple
              sub-accounts with ultra-low latency, custom LLM sandboxing, and
              advanced multi-tenant risk management.
            </p>
          </section>

          {/* Features */}
          <section className="relative max-w-3xl mx-auto px-6 pb-16 space-y-6">
            {features.map((f) => (
              <div
                key={f.title}
                className="flex items-start gap-5 p-5 rounded-xl border border-border bg-card/60 backdrop-blur-sm"
              >
                <div className="w-10 h-10 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                  <f.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground mb-1">
                    {f.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {f.description}
                  </p>
                </div>
              </div>
            ))}
          </section>

          {/* CTA */}
          <section className="relative max-w-xl mx-auto px-6 pb-20">
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-8 text-center space-y-4">
                <h3 className="text-xl font-semibold text-foreground">
                  Ready to scale your fund?
                </h3>
                <Button
                  asChild
                  size="lg"
                  className="bg-gradient-to-r from-primary to-accent"
                >
                  <a href="mailto:founders@tradeky.in">
                    Contact Institutional Sales
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </a>
                </Button>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </MainLayout>
  );
}
