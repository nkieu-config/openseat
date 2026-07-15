import Link from "next/link";

const footerLinks = [
  { label: "Demo event", href: "/events/bangkok-indie-fest" },
  { label: "GitHub", href: "https://github.com/nkieu-config/openseat" },
  { label: "API docs", href: "https://openseat-api.onrender.com/api/docs" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="font-display text-sm font-semibold tracking-tight">
            Open<span className="text-muted-foreground">Seat</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Open ticketing that never sells the same seat twice. A portfolio build, shipped
            milestone by milestone.
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {footerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
