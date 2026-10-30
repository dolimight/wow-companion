import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { iconUrl } from "../../lib/assets";

export function ItemIcon({ icon, quality, size = "medium", label }: { icon: number | null | undefined; quality?: number; size?: "small" | "medium" | "large"; label?: string }) {
  const [failed, setFailed] = useState(false);
  const url = failed ? null : iconUrl(icon);
  useEffect(() => setFailed(false), [icon]);
  return (
    <span className={`game-icon game-icon-${size} quality-${quality ?? 1}`} aria-hidden={label ? undefined : true} role={label ? "img" : undefined} aria-label={label}>
      {url ? <img src={url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} /> : <Shield />}
    </span>
  );
}
