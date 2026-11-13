require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./config/db');
const platforms = require('./platforms');
const { resolveCollege } = require('./middleware/tenant');

const app = express();

// Behind a reverse proxy (nginx, Render, Fly, ...) set TRUST_PROXY (e.g. "1") so
// rate limiting sees real client IPs rather than the proxy's.
if (process.env.TRUST_PROXY) {
    app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
}

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.send('Leaderboard API is running'));

// Everything below is tenant-scoped.
app.use(resolveCollege);

// Public college info (branding, sign-up rules, filter options) for the frontend.
app.get('/college', async (req, res) => {
    const { college_id, slug, name, logo_url, email_domains, require_verified_handles, departments } = req.college;
    const batches = await pool.query(
        `SELECT DISTINCT batch FROM users
         WHERE college_id = $1 AND is_active AND batch IS NOT NULL ORDER BY batch DESC`,
        [college_id]
    );
    res.json({
        slug, name, logo_url, email_domains, require_verified_handles, departments,
        batches: batches.rows.map((r) => r.batch),
        platforms: platforms.describe(),
    });
});

app.use(require('./routes/auth'));
app.use(require('./routes/profile'));
app.use(require('./routes/leaderboard'));
app.use(require('./routes/users'));
app.use(require('./routes/admin'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
