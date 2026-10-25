const SYMBOLS: Record<string, string> = {
  INR: "₹", USD: "$", EUR: "€", GBP: "£", AED: "د.إ", SGD: "S$",
  AUD: "A$", CAD: "C$", JPY: "¥", CHF: "CHF ",
};

export function symbol(currency: string): string {
  return SYMBOLS[currency] || currency + " ";
}

export function money(amount: number, currency = "INR", compact = false): string {
  const sym = symbol(currency);
  const neg = amount < 0;
  let v = Math.abs(amount);
  let str: string;
  if (compact && v >= 100000) {
    if (currency === "INR") {
      if (v >= 10000000) str = (v / 10000000).toFixed(2) + "Cr";
      else str = (v / 100000).toFixed(2) + "L";
    } else {
      if (v >= 1000000) str = (v / 1000000).toFixed(2) + "M";
      else str = (v / 1000).toFixed(1) + "K";
    }
  } else {
    str = v.toLocaleString(currency === "INR" ? "en-IN" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return `${neg ? "-" : ""}${sym}${str}`;
}

export function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  } catch {
    return iso;
  }
}

export function fmtFullDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}
