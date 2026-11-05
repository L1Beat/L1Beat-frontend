/**
 * Edge refraction for liquid glass, the part CSS blur cannot do: near the
 * rim the backdrop is sampled from further inside, so the edge reads as a
 * thick curved lens. Built as an SVG displacement filter applied through
 * `backdrop-filter: url(#…)`, which only Chromium renders; other browsers
 * keep the plain frosted glass.
 */

/** Chromium (desktop and Android) renders SVG filters in backdrop-filter. */
export function supportsBackdropRefraction(): boolean {
  if (typeof navigator === 'undefined') return false;
  const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands;
  return !!brands?.some((b) => /Chromium/i.test(b.brand));
}

const mapCache = new Map<string, string>();

/**
 * Displacement map for a capsule of the given size. Red and green encode the
 * x and y offset (128 = none); inside a band along the rim each pixel points
 * inward, strongest at the edge and fading to nothing `band` px in.
 */
export function capsuleDisplacementMap(w: number, h: number, band = 16): string {
  // A hidden dock (desktop, or before layout) measures 0 x 0; there is nothing to refract.
  w = Math.round(w);
  h = Math.round(h);
  if (!(w > 0 && h > 0)) return '';
  const key = `${w}x${h}x${band}`;
  const hit = mapCache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  let img: ImageData;
  try {
    img = ctx.createImageData(w, h);
  } catch {
    return '';
  }
  const r = h / 2;
  // Capsule = a horizontal segment from (r, r) to (w - r, r), thickened by r.
  const x0 = r;
  const x1 = Math.max(r, w - r);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cx = Math.min(Math.max(x + 0.5, x0), x1);
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - r;
      const dist = Math.hypot(dx, dy);
      const depth = r - dist; // distance in from the rim
      let ox = 0;
      let oy = 0;
      if (depth >= 0 && depth < band && dist > 0) {
        const s = (1 - depth / band) ** 2;
        // Sample from further in: offset opposite the outward normal.
        ox = (-dx / dist) * s;
        oy = (-dy / dist) * s;
      }
      const i = (y * w + x) * 4;
      img.data[i] = Math.round(128 + ox * 127);
      img.data[i + 1] = Math.round(128 + oy * 127);
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const url = canvas.toDataURL();
  mapCache.set(key, url);
  return url;
}
