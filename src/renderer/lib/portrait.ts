export type PortraitCrop = { x: number; y: number; size: number };

/** Frame the head and shoulders from the silhouette, ignoring the render's empty canvas */
export function portraitCrop(pixels: Uint8ClampedArray, width: number, height: number): PortraitCrop | null {
  let top = height, bottom = -1, transparent = false;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const alpha = pixels[(y * width + x) * 4 + 3];
    if (alpha < 16) transparent = true;
    if (alpha > 32) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
  }
  // Never reintroduce a baked-in background when a provider supplies an opaque image
  if (!transparent || bottom < top) return null;
  const upperHeight = Math.max(1, Math.ceil((bottom - top + 1) * 0.22));
  let left = width, right = -1;
  for (let y = top; y < Math.min(height, top + upperHeight); y++) for (let x = 0; x < width; x++) {
    if (pixels[(y * width + x) * 4 + 3] > 32) { left = Math.min(left, x); right = Math.max(right, x); }
  }
  if (right < left) return null;
  const size = Math.ceil(Math.max(right - left + 1, upperHeight) * 0.85);
  return { x: (left + right + 1 - size) / 2, y: top - size * 0.05, size };
}

const portraits = new Map<string, Promise<string | null>>();

/** Reuse the same local transparent cutout for the roster, sidebar, and character switcher */
export function transparentPortrait(source: string): Promise<string | null> {
  const cached = portraits.get(source);
  if (cached) return cached;
  const request = (async () => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = source;
    await image.decode();
    const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const crop = portraitCrop(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
    if (!crop) return null;
    const portrait = document.createElement("canvas");
    portrait.width = portrait.height = 128;
    const output = portrait.getContext("2d");
    if (!output) return null;
    output.drawImage(canvas, crop.x, crop.y, crop.size, crop.size, 0, 0, 128, 128);
    return portrait.toDataURL("image/png");
  })().catch(() => { portraits.delete(source); return null; });
  portraits.set(source, request);
  if (portraits.size > 100) portraits.delete(portraits.keys().next().value!);
  return request;
}
