export function formatPrice(price: number | null, currency = "INR") {
  if (price == null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(price);
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function truncate(value: string, max = 60) {
  return value.length > max ? `${value.slice(0, max).trimEnd()}…` : value;
}
