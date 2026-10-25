import { DEFAULT_DEMO_MODE_BADGE, demoBadgeText } from "@/lib/settings";

/**
 * Fixed banner shown on every page while MODEL_MODE=fake, so recorded model
 * output is never mistaken for a live model. Server component: it reads the
 * env on each request. Unreadable settings count as fake, so the banner fails
 * towards showing.
 */
export function DemoBadge() {
  let text: string | null;
  try {
    text = demoBadgeText();
  } catch {
    text = DEFAULT_DEMO_MODE_BADGE;
  }
  if (text === null) return null;
  return (
    <div
      role="status"
      data-testid="demo-mode-badge"
      style={{
        position: "fixed",
        bottom: 12,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        padding: "6px 14px",
        borderRadius: 999,
        background: "#facc15",
        color: "#1a1a1a",
        font: "600 13px/1.2 system-ui, sans-serif",
        boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
        pointerEvents: "none",
      }}
    >
      {text}
    </div>
  );
}
