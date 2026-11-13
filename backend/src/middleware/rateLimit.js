const { rateLimit } = require('express-rate-limit');

const make = (windowMinutes, limit, message) =>
    rateLimit({
        windowMs: windowMinutes * 60 * 1000,
        limit,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        message: { error: message },
    });

// Per-IP limits. (Per-email limits live in services/otp.js: resend cooldown and
// max guesses per code.) Set TRUST_PROXY when deployed behind a reverse proxy,
// otherwise every user shares the proxy's IP.
module.exports = {
    sendOtpLimiter: make(60, 10, 'Too many code requests. Try again later.'),
    verifyOtpLimiter: make(15, 30, 'Too many attempts. Try again later.'),
    verifyHandleLimiter: make(15, 20, 'Too many verification attempts. Try again later.'),
};
