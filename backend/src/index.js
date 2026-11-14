require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./config/db');
const platforms = require('./platforms');
const { effectiveLogoUrl } = require('./lib/logo');
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
    const { college_id, slug, name, email_domains, require_verified_handles, departments,
            brand_primary, brand_secondary, tagline } = req.college;
    const logo_url = effectiveLogoUrl(req.college);
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

// The uploaded logo image. Public (it is shown to logged-out visitors). The URL carries ?v=<hash>, so it can be
// cached for a long time: a new upload gets a new URL. An uploaded SVG could contain script, so it is served
// with a sandboxing CSP and nosniff: harmless inside <img>, inert if someone opens the address directly.
app.get('/college/logo', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT content_type, data FROM college_logos WHERE college_id = $1', [req.college.college_id]);
        if (rows.length === 0) return res.status(404).json({ error: 'No logo uploaded' });
        res.set({
            'Content-Type': rows[0].content_type,
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
            'Cross-Origin-Resource-Policy': 'cross-origin',
        });
        res.send(rows[0].data);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server Error' });
    }
});

app.use(require('./routes/auth'));
app.use(require('./routes/profile'));
app.use(require('./routes/leaderboard'));
app.use(require('./routes/users'));
app.use(require('./routes/admin'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
