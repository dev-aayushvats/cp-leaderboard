// Brand colors. Mirrors backend/src/lib/branding.js, which is the source of truth;
// this copy only gives the admin form instant feedback before saving.
export const DEFAULT_BRAND = { primary: "#82b1ff", secondary: "#d1c4e9" };
export const MIN_CONTRAST = 4.5;
const APP_BACKGROUND = "#0a0a0a";
export const HEX = /^#[0-9a-f]{6}$/i;

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const contrastOnDark = (hex) => (luminance(hex) + 0.05) / (luminance(APP_BACKGROUND) + 0.05);

// "#82b1ff" -> "130 177 255". Returns null for anything that isn't a plain 6-digit hex,
// so only validated digits ever reach the injected <style>.
export function hexToTriplet(hex) {
  if (typeof hex !== "string" || !HEX.test(hex)) return null;
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");
}

// The CSS that applies a college's colors (or nothing, for the defaults)
export function themeCss(college) {
  const a = hexToTriplet(college?.brand_primary);
  const b = hexToTriplet(college?.brand_secondary);
  const decls = [a && `--brand:${a}`, b && `--brand-2:${b}`].filter(Boolean).join(";");
  return decls ? `:root{${decls}}` : "";
}

// null if fine, otherwise a message for the admin form
export function colorProblem(hex, label) {
  if (!hex) return null;
  if (!HEX.test(hex)) return `${label} must look like #82b1ff`;
  const ratio = contrastOnDark(hex);
  return ratio < MIN_CONTRAST
    ? `${label} is too dark to read on the dark background (${ratio.toFixed(1)}:1, needs ${MIN_CONTRAST}:1). Pick a lighter color.`
    : null;
}
