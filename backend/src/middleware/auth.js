const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('❌ JWT_SECRET is not set. Add it to backend/.env (see .env.example).');
    process.exit(1);
}

const signToken = (user) =>
    jwt.sign({ user_id: user.user_id, college_id: user.college_id }, JWT_SECRET, { expiresIn: '7d' });

// Verifies the JWT, then loads the user fresh from the DB so that role changes
// and suspensions take effect immediately instead of when the token expires.
// A token is only valid for the college it was issued in. All failures are 401
// so the frontend reliably logs the user out.
const authenticate = async (req, res, next) => {
    const token = (req.headers['authorization'] || '').split(' ')[1];
    if (!token) return res.sendStatus(401);

    let payload;
    try {
        payload = jwt.verify(token, JWT_SECRET);
    } catch {
        return res.sendStatus(401);
    }
    if (!payload.college_id || payload.college_id !== req.college.college_id) return res.sendStatus(401);

    const { rows } = await pool.query(
        'SELECT user_id, college_id, username, role, is_active FROM users WHERE user_id = $1 AND college_id = $2',
        [payload.user_id, req.college.college_id]
    );
    if (rows.length === 0) return res.sendStatus(401);
    if (!rows[0].is_active) return res.status(401).json({ error: 'Account suspended' });

    req.user = rows[0];
    next();
};

const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'college_admin') return res.status(403).json({ error: 'Admin access required' });
    next();
};

module.exports = { signToken, authenticate, requireAdmin };
