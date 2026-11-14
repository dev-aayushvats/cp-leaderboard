const crypto = require('crypto');

const MAX_LOGO_BYTES = 512 * 1024;

// What the bytes ARE, regardless of what the upload claimed. -> { type, ext } | null
function sniffImage(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
    if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { type: 'image/png' };
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { type: 'image/jpeg' };
    const head = buf.subarray(0, 6).toString('latin1');
    if (head === 'GIF87a' || head === 'GIF89a') return { type: 'image/gif' };
    if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return { type: 'image/webp' };
    // SVG is text: look for an <svg root near the start (after an optional XML prolog, comments, doctype)
    const text = buf.subarray(0, 2048).toString('utf8').replace(/^﻿/, '').trimStart();
    if (/^(<\?xml[^>]*\?>\s*|<!--[\s\S]*?-->\s*|<!DOCTYPE[^>]*>\s*)*<svg[\s>]/i.test(text)) return { type: 'image/svg+xml' };
    return null;
}

const logoVersion = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);

// The URL the browser should load for a college's logo: the uploaded image if there is one, else the pasted URL.
// Same-origin and relative on purpose: every deployment serves the API under /api (see the frontend proxy).
const PUBLIC_API_PATH = process.env.PUBLIC_API_PATH || '/api';
const effectiveLogoUrl = (college) =>
    college.logo_version ? `${PUBLIC_API_PATH}/college/logo?v=${college.logo_version}` : college.logo_url;

module.exports = { MAX_LOGO_BYTES, sniffImage, logoVersion, effectiveLogoUrl };
