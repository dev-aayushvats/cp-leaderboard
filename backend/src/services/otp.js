const crypto = require('crypto');
const nodemailer = require('nodemailer');
const pool = require('../config/db');

const MAX_ATTEMPTS = 5;        // wrong guesses before a code is destroyed
const RESEND_COOLDOWN_S = 60;  // minimum gap between codes for one email

// Mail transport. SMTP_HOST selects any SMTP server (a college's own mail server, Google Workspace,
// Microsoft 365, SES, Brevo...); without it we use Gmail with EMAIL_USER / EMAIL_PASS (an App Password).
// SMTP_USER / SMTP_PASS default to EMAIL_USER / EMAIL_PASS, and SMTP_SECURE defaults to true on port 465.
const smtpPort = parseInt(process.env.SMTP_PORT, 10) || 587;
const mailUser = process.env.SMTP_USER || process.env.EMAIL_USER;
const mailPass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
const auth = mailUser ? { user: mailUser, pass: mailPass } : undefined; // some internal relays need no login
const transporter = process.env.SMTP_HOST
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: smtpPort,
        secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : smtpPort === 465,
        auth,
    })
    : nodemailer.createTransport({ service: 'gmail', auth });
const MAIL_FROM = process.env.EMAIL_FROM || `"Competitive Leaderboard" <${mailUser}>`;

// Generates, stores and emails an OTP.
// Returns { sent: true } or { sent: false, retryAfter } when still in cooldown.
async function issueOtp(email, subject, bodyPrefix) {
    const { rows } = await pool.query(
        'SELECT CEIL($2::int - EXTRACT(EPOCH FROM (NOW() - created_at))) AS wait FROM email_otps WHERE email = $1',
        [email, RESEND_COOLDOWN_S]
    );
    const wait = rows[0] ? Number(rows[0].wait) : 0;
    if (wait > 0) return { sent: false, retryAfter: wait };

    const otp = crypto.randomInt(100000, 1000000).toString(); // 100000–999999 inclusive
    await pool.query(
        `INSERT INTO email_otps (email, otp_code) VALUES ($1, $2)
         ON CONFLICT (email) DO UPDATE
         SET otp_code = $2, attempts = 0, created_at = NOW(), expires_at = NOW() + INTERVAL '5 minutes'`,
        [email, otp]
    );

    try {
        await transporter.sendMail({
            from: MAIL_FROM,
            to: email,
            subject,
            text: `${bodyPrefix} ${otp}. It expires in 5 minutes. Do not share this code.`,
        });
    } catch (err) {
        // Don't leave an unsent code behind: it would lock the user out via the cooldown.
        await pool.query('DELETE FROM email_otps WHERE email = $1', [email]);
        throw err;
    }
    return { sent: true };
}

// Checks a guess. Every check consumes one attempt (atomically, so parallel
// requests can't get extra guesses); after MAX_ATTEMPTS the code is deleted.
async function verifyOtp(email, guess) {
    const { rows } = await pool.query(
        `UPDATE email_otps SET attempts = attempts + 1
         WHERE email = $1 AND expires_at > NOW() AND attempts < $2
         RETURNING otp_code, attempts`,
        [email, MAX_ATTEMPTS]
    );
    if (rows.length === 0) return false;

    const expected = Buffer.from(rows[0].otp_code);
    const given = Buffer.from(String(guess || ''));
    const ok = expected.length === given.length && crypto.timingSafeEqual(expected, given);

    if (!ok && rows[0].attempts >= MAX_ATTEMPTS) {
        await pool.query('DELETE FROM email_otps WHERE email = $1', [email]);
    }
    return ok;
}

const clearOtp = (clientOrPool, email) =>
    clientOrPool.query('DELETE FROM email_otps WHERE email = $1', [email]);

module.exports = { issueOtp, verifyOtp, clearOtp };
