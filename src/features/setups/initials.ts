/** Initials for a seat avatar on a preset tile ("Jean-Paul Sartre" → "JS"; "" → seat number). */
export function seatInitials(name: string, index: number): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return String(index + 1);
  const first = words[0]![0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]![0] ?? "") : "";
  return (first + last).toLocaleUpperCase();
}
