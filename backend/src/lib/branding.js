// Brand color validation. Colors are used as text/accents on the app's dark
// background, so they must stay readable there (WCAG AA for normal text: 4.5:1).
const APP_BACKGROUND = '#0a0a0a';
const MIN_CONTRAST = 4.5;
const HEX = /^#[0-9a-f]{6}$/i;

function luminance(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrastOnDark = (hex) => (luminance(hex) + 0.05) / (luminance(APP_BACKGROUND) + 0.05);

// -> { value } (normalised lowercase hex, or null to reset to the default) or { error }
function parseBrandColor(input, label) {
    if (input === null || input === '') return { value: null };
    if (typeof input !== 'string' || !HEX.test(input)) {
        return { error: `${label} must be a color like #82b1ff` };
    }
    const hex = input.toLowerCase();
    const ratio = contrastOnDark(hex);
    if (ratio < MIN_CONTRAST) {
        return { error: `${label} is too dark to read on the dark background (contrast ${ratio.toFixed(1)}:1, needs ${MIN_CONTRAST}:1). Pick a lighter color.` };
    }
    return { value: hex };
}

module.exports = { parseBrandColor, contrastOnDark, MIN_CONTRAST };
