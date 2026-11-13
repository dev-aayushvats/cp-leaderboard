const { rateLimit } = require('express-rate-limit');

// A positive integer from the environment, else the default
const fromEnv = (name, fallback) => {
    const n = Number(process.env[name]);
    return Number.isInteger(n) && n > 0 ? n : fallback;
};

const make = (windowMinutes, limit, message) =>
    rateLimit({
        windowMs: windowMinutes * 60 * 1000,
        limit,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        message: { error: message },
    });

// Per-IP limits. (Per-email limits live in services/otp.js: resend cooldown and max guesses per code,
// which protect accounts regardless of IP.) These only work if the API can see each client's real IP,
// which needs a reverse proxy that sets X-Forwarded-For and TRUST_PROXY set to the number of proxies
// in front. With no proxy every user shares one bucket, so raise these limits for such installs.
module.exports = {
    sendOtpLimiter: make(60, fromEnv('RATE_LIMIT_CODES_PER_HOUR', 10), 'Too many code requests. Try again later.'),
    verifyOtpLimiter: make(15, fromEnv('RATE_LIMIT_VERIFY_PER_15_MIN', 30), 'Too many attempts. Try again later.'),
    verifyHandleLimiter: make(15, fromEnv('RATE_LIMIT_HANDLE_VERIFY_PER_15_MIN', 20), 'Too many verification attempts. Try again later.'),
};
