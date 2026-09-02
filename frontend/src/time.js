export function parseUtcEpoch(value) {
  const text = String(value ?? "");
  if (!text) return undefined;
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text) ? `${text}:00` : text;
  const date = new Date(`${normalized}Z`);
  return Number.isFinite(date.getTime()) ? Math.floor(date.getTime() / 1000) : undefined;
}
