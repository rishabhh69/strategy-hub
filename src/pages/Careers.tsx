import { ArrowRight } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";

const roles = [
  {
    title: "Senior Python/FastAPI Engineer",
    location: "Remote / Bangalore",
    tag: "Engineering",
  },
  {
    title: "Quantitative Researcher",
    location: "Remote",
    tag: "Finance",
  },
  {
    title: "Frontend React Developer",
    location: "Remote",
    tag: "Engineering",
  },
];

export default function Careers() {
  return (
    <MainLayout>
      <div className="h-full overflow-auto">
        {/* Hero */}
        <section className="max-w-3xl mx-auto text-center py-20 px-6">
          <Badge variant="outline" className="mb-4 text-primary border-primary/30">
            Join Tradeky
          </Badge>
          <h1 className="text-4xl font-bold text-foreground mb-6 leading-tight">
            Build the Future of Finance.
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed">
            We are a fast-growing team of engineers, quants, and designers
            backed by leading investors. If you are passionate about AI,
            financial markets, and building scalable infrastructure, we want you
            on our team.
          </p>
        </section>

        {/* Open Roles */}
        <section className="max-w-3xl mx-auto px-6 pb-20 space-y-4">
          <h2 className="text-2xl font-semibold text-foreground mb-6">
            Open Roles
          </h2>
          {roles.map((r) => (
            <button
              key={r.title}
              className="w-full flex items-center justify-between gap-4 p-5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-card/80 transition-all group text-left"
            >
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                  {r.title}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {r.location}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge variant="secondary" className="text-xs">
                  {r.tag}
                </Badge>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </button>
          ))}
        </section>
      </div>
    </MainLayout>
  );
}
