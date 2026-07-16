import Link from "next/link";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { getServerDictionary } from "@/i18n/server";

export async function SiteFooter() {
  const dict = await getServerDictionary();
  const footerLinks = [
    { label: dict.nav.demoEvent, href: "/events/bangkok-indie-fest" },
    { label: dict.nav.github, href: "https://github.com/nkieu-config/openseat" },
    {
      label: dict.nav.apiDocs,
      href: "https://openseat-api.onrender.com/api/docs",
    },
  ];

  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="font-display text-sm font-semibold tracking-tight">
            Open<span className="text-muted-foreground">Seat</span>
          </p>
          <p className="max-w-sm text-xs text-muted-foreground">
            {dict.common.tagline}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
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
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}
