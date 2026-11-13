const jwt = require('jsonwebtoken');
const { normalizeEmail } = require('../lib/college');

// The platform operator ("super admin") is not a member of any college, so their
// identity isn't a row in `users`: it's an allowlist of email addresses in the
// environment (SUPERADMIN_EMAILS, comma-separated). They sign in with the same
// emailed code as everyone else and get a different kind of token (operator: true,
// no college), which the college routes reject and vice versa.
const TOKEN_TTL = '12h';

// Read on every call so the allowlist is the single source of truth: removing an
// address (and restarting) revokes that operator's existing tokens too.
const operatorEmails = () => (process.env.SUPERADMIN_EMAILS || '').split(',').map(normalizeEmail).filter(Boolean);
const isOperatorEmail = (email) => operatorEmails().includes(normalizeEmail(email));

const signOperatorToken = (email) =>
    jwt.sign({ operator: true, email: normalizeEmail(email) }, process.env.JWT_SECRET, { expiresIn: TOKEN_TTL });

const authenticateOperator = (req, res, next) => {
    const token = (req.headers['authorization'] || '').split(' ')[1];
    if (!token) return res.sendStatus(401);
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        if (payload.operator !== true || !isOperatorEmail(payload.email)) return res.sendStatus(401);
        req.operator = { email: payload.email };
        next();
    } catch {
        res.sendStatus(401);
    }
};

module.exports = { isOperatorEmail, signOperatorToken, authenticateOperator };
