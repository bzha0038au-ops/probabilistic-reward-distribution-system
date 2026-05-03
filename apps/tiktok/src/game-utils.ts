import type { Card } from "./app-types";

export function formatMoney(amount: number): string {
  return `$${amount}`;
}

export function formatApiMoney(amount: string, fallback = "$0"): string {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(parsed) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(parsed);
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatTimestamp(value: string | Date | null | undefined): string {
  if (!value) {
    return "Unknown";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return "Unknown";
  }

  return parsed.toLocaleString("en-AU", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function truncateMiddle(value: string, edge = 6): string {
  if (value.length <= edge * 2 + 1) {
    return value;
  }

  return `${value.slice(0, edge)}…${value.slice(-edge)}`;
}

export function formatDurationMinutes(seconds: number | null | undefined): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) {
    return "Unknown cadence";
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 1) {
    return `${seconds}s cadence`;
  }

  return `${minutes}m cadence`;
}

export function getBlackjackTotal(cards: Card[]): number {
  return cards.reduce((total, card) => total + parseInt(card.rank, 10), 0);
}
