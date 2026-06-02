/** Extraction de la couleur dominante d'une image (côté client) + helpers couleur purs. */

export interface DominantColor {
  /** Couleur dominante (fond). */
  base: string;
  /** Nuance pour le panneau d'infos (léger contraste). */
  panel: string;
  /** Bordure / cadre (plus foncé). */
  border: string;
  /** Couleur de texte lisible : noir ou blanc selon la luminosité du fond. */
  textColor: '#000000' | '#ffffff';
  isDark: boolean;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => clamp(n).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Convertit une couleur hex en `rgba()` avec l'alpha fourni (0–1). */
export function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Luminance perçue (0–255). */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Seuil de luminosité (point milieu) pour choisir texte noir vs blanc. */
const LUMINANCE_MIDPOINT = 128;

/** Texte noir ou blanc selon la luminosité du fond. */
export function pickTextColor(hex: string): '#000000' | '#ffffff' {
  return luminance(hex) < LUMINANCE_MIDPOINT ? '#ffffff' : '#000000';
}

/** Mélange deux couleurs hex (t = 0 → a, t = 1 → b). */
export function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex(
    ca.r + (cb.r - ca.r) * t,
    ca.g + (cb.g - ca.g) * t,
    ca.b + (cb.b - ca.b) * t
  );
}

/** Construit un DominantColor (base + nuances + texte) à partir d'une couleur de base. */
export function buildDominantColor(base: string): DominantColor {
  const isDark = luminance(base) < LUMINANCE_MIDPOINT;
  return {
    base,
    panel: mixHex(base, isDark ? '#ffffff' : '#000000', 0.12),
    border: mixHex(base, '#000000', 0.25),
    textColor: pickTextColor(base),
    isDark,
  };
}

/**
 * Extrait la couleur dominante d'une image (data URL) via un canvas downsamplé.
 * Retourne `null` si hors navigateur ou en cas d'échec.
 */
export async function extractDominantColor(dataUrl: string): Promise<DominantColor | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  try {
    const img = await loadImage(dataUrl);
    const size = 40;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
    let avgR = 0;
    let avgG = 0;
    let avgB = 0;
    let avgCount = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 128) continue; // pixel transparent
      avgR += r;
      avgG += g;
      avgB += b;
      avgCount += 1;
      // Ignore les extrêmes quasi-blanc / quasi-noir pour le bucket dominant.
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max > 245 && min > 245) continue;
      if (max < 12 && min < 12) continue;
      // Quantification 5 bits/canal.
      const key = `${r >> 3}-${g >> 3}-${b >> 3}`;
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.count += 1;
        bucket.r += r;
        bucket.g += g;
        bucket.b += b;
      } else {
        buckets.set(key, { count: 1, r, g, b });
      }
    }

    let best: { count: number; r: number; g: number; b: number } | null = null;
    for (const bucket of buckets.values()) {
      if (!best || bucket.count > best.count) best = bucket;
    }

    let base: string;
    if (best) {
      base = rgbToHex(best.r / best.count, best.g / best.count, best.b / best.count);
    } else if (avgCount > 0) {
      base = rgbToHex(avgR / avgCount, avgG / avgCount, avgB / avgCount);
    } else {
      return null;
    }

    return buildDominantColor(base);
  } catch {
    return null;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load error'));
    img.src = src;
  });
}
