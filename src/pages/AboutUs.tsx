import { Eye, Brain, Shield } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const values = [
  {
    icon: Eye,
    title: "Radical Transparency",
    description:
      "No black boxes. We empower traders to understand exactly how their algorithms function, test them rigorously, and trade with confidence.",
  },
  {
    icon: Brain,
    title: "AI-Powered Alpha",
    description:
      "We believe AI is the great equalizer. Our English-to-Code engine allows anyone with market intuition to build complex strategies.",
  },
  {
    icon: Shield,
    title: "Risk First",
    description:
      "Capital preservation is paramount. Our proprietary Greed AI system monitors your portfolio health 24/7 to protect against outsized drawdowns.",
  },
];

export default function AboutUs() {
  return (
    <MainLayout>
      <div className="h-full overflow-auto">
        {/* Hero */}
        <section className="max-w-3xl mx-auto text-center py-20 px-6">
          <Badge variant="outline" className="mb-4 text-primary border-primary/30">
            Our Mission
          </Badge>
          <h1 className="text-4xl font-bold text-foreground mb-6 leading-tight">
            Democratizing Institutional Trading.
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed">
            Tradeky was founded on a simple principle: the algorithmic tools used
            by top quantitative funds shouldn't be locked behind closed doors. We
            are bridging the gap between retail traders and institutional
            execution by combining cutting-edge AI strategy generation, rigorous
            backtesting engines, and a compliant, data-driven community.
          </p>
        </section>

        {/* Values Grid */}
        <section className="max-w-5xl mx-auto px-6 pb-20">
          <h2 className="text-2xl font-semibold text-foreground text-center mb-10">
            Our Core Values
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {values.map((v) => (
              <Card key={v.title} className="bg-card border-border">
                <CardContent className="p-6 space-y-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <v.icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">{v.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {v.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </MainLayout>
  );
}
