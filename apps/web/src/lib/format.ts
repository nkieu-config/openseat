const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Bangkok",
});

export function formatEventDate(iso: string | Date): string {
  return dateFormatter.format(new Date(iso));
}

export function formatPrice(satang: number): string {
  if (satang === 0) {
    return "Free";
  }
  return `฿${(satang / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}
