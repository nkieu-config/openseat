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

export function formatBaht(satang: number): string {
  const baht = satang / 100;
  const fractionDigits = Number.isInteger(baht) ? 0 : 2;
  return `฿${baht.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`;
}

export function formatPercentBp(basisPoints: number): string {
  return `${(basisPoints / 100).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })}%`;
}

export function formatDayLabel(iso: string | Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(iso));
}
