import { Button } from "@/components/ui/button";

const stack = ["Next.js", "NestJS", "PostgreSQL", "Redis", "Go"];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-24">
      <div className="flex flex-col items-center gap-6 text-center">
        <span className="rounded-full border border-border px-3 py-1 font-mono text-xs text-muted-foreground">
          foundation build · M0
        </span>
        <h1 className="text-5xl font-semibold tracking-tight sm:text-7xl">
          Open<span className="text-muted-foreground">Seat</span>
        </h1>
        <p className="max-w-xl text-balance text-lg text-muted-foreground">
          Open ticketing with real-time reserved seating. Create an event, share the link, and let
          people pick their exact seat — built to survive on-sale rushes without ever
          double-selling.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="outline" disabled>
          Live demo — arrives with M1
        </Button>
      </div>
      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 font-mono text-xs text-muted-foreground">
        {stack.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </main>
  );
}
