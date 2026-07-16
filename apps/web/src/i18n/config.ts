export const locales = ["en", "th"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
export const LOCALE_COOKIE = "os_locale";

export const localeNames: Record<Locale, string> = {
  en: "English",
  th: "ไทย",
};

export function isLocale(value: string | undefined): value is Locale {
  return value === "en" || value === "th";
}

export function persistLocale(locale: Locale): void {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}
