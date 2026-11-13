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
// Bulk member import posts up to 1000 rows; everything else keeps the small default limit.
// (Registered first: body-parser skips a request that has already been parsed.)
app.use('/admin/users/import', express.json({ limit: '1mb' }));
app.use(express.json());

app.get('/', (req, res) => res.send('Leaderboard API is running'));

// Platform console (operator-level): not tied to any college, so it comes before tenant resolution.
app.use(require('./routes/platform'));

// Everything below is tenant-scoped.
app.use(resolveCollege);

// Public college info (branding, sign-up rules, filter options) for the frontend.
app.get('/college', async (req, res) => {
    const { college_id, slug, name, logo_url, email_domains, require_verified_handles, departments,
            brand_primary, brand_secondary, tagline } = req.college;
    const batches = await pool.query(
        `SELECT DISTINCT batch FROM users
         WHERE college_id = $1 AND is_active AND batch IS NOT NULL ORDER BY batch DESC`,
        [college_id]
    );
    res.json({
        slug, name, logo_url, email_domains, require_verified_handles, departments,
        brand_primary, brand_secondary, tagline,
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
