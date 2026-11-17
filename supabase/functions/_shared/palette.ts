/**
 * Poster-derived colour theme (P2). Pure: takes decoded RGBA pixels, returns a palette.
 * Used by the tmdb edge function after decoding a small (w92) poster JPEG, stored in films_cache.palette.
 *
 * Method: quantise each pixel to a 4-bit-per-channel bucket, then score buckets by
 * population x (0.3 + saturation) while ignoring near-black/near-white pixels, so a vivid
 * colour that covers a decent area beats a large grey background.
 */

export interface PosterPalette {
  primary: string; // vivid accent from the poster
  dark: string; // deep background tone for dark mode
  light: string; // pale tint for light mode
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

export function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return (
    '#' +
    rgb
      .map((v) =>
        Math.round((v + m) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
      .toUpperCase()
  );
}

export function paletteFromPixels(rgba: Uint8Array | Uint8ClampedArray | number[]): PosterPalette | null {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const a = rgba[i + 3];
    if (a < 128) continue;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const cur = buckets.get(key);
    if (cur) {
      cur.n += 1;
      cur.r += r;
      cur.g += g;
      cur.b += b;
    } else buckets.set(key, { n: 1, r, g, b });
  }
  if (buckets.size === 0) return null;

  let best: { score: number; h: number; s: number; l: number } | null = null;
  let fallback: { n: number; h: number; s: number; l: number } | null = null;
  buckets.forEach((v) => {
    const [h, s, l] = rgbToHsl(v.r / v.n, v.g / v.n, v.b / v.n);
    if (!fallback || v.n > fallback.n) fallback = { n: v.n, h, s, l };
    if (l < 0.12 || l > 0.9) return;
    const score = v.n * (0.3 + s);
    if (!best || score > best.score) best = { score, h, s, l };
  });
  const pick = (best ?? fallback) as { h: number; s: number; l: number } | null;
  if (!pick) return null;
  const sat = Math.max(pick.s, 0.35);
  return {
    primary: hslToHex(pick.h, Math.min(sat, 0.85), Math.min(Math.max(pick.l, 0.45), 0.62)),
    dark: hslToHex(pick.h, Math.min(sat, 0.5), 0.12),
    light: hslToHex(pick.h, Math.min(sat, 0.6), 0.93),
  };
}
