/** Time helpers for "play the moment": a voice note span, shown and played in milliseconds. */

export function clockLabel(ms: number): string {
  const tenths = Math.floor(Math.max(0, ms) / 100);
  const minutes = Math.floor(tenths / 600);
  const rest = tenths % 600;
  return `${minutes}:${String(Math.floor(rest / 10)).padStart(2, "0")}.${rest % 10}`;
}

export function rangeLabel(startMs: number, endMs: number): string {
  return `${clockLabel(startMs)} to ${clockLabel(endMs)}`;
}

/** True once playback (seconds) has reached the end of the span (milliseconds). */
export function reachedEnd(currentTimeSeconds: number, endMs: number): boolean {
  return currentTimeSeconds * 1000 >= endMs;
}
