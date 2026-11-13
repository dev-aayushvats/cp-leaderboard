const axios = require('axios');
const { PlatformError } = require('./errors');

const API_URL = 'https://codeforces.com/api/user.info';

// Returns the user object, or throws a typed PlatformError.
async function getUser(handle) {
    try {
        const { data } = await axios.get(`${API_URL}?handles=${encodeURIComponent(handle)}`, { timeout: 15000 });
        if (data.status === 'OK' && data.result?.[0]) return data.result[0];
        throw new PlatformError('unavailable', `Codeforces: ${data.comment || 'unexpected response'}`);
    } catch (err) {
        if (err instanceof PlatformError) throw err;
        // Unknown handles come back as HTTP 400 + {status:'FAILED', comment:'handles: User with handle X not found'}
        if (err.response?.data?.status === 'FAILED' && /not found/i.test(err.response.data.comment || '')) {
            throw new PlatformError('not_found', `No Codeforces user named "${handle}"`);
        }
        throw new PlatformError('unavailable', `Codeforces unreachable: ${err.message}`);
    }
}

async function fetchStats(handle) {
    const user = await getUser(handle);
    return { rating: user.rating || 0, maxRating: user.maxRating || 0, solved: null }; // solved count isn't collected
}

async function fetchProfileText(handle) {
    try {
        const u = await getUser(handle);
        return { exists: true, text: [u.firstName, u.lastName, u.organization, u.city].filter(Boolean).join(' ') };
    } catch (err) {
        if (err.kind === 'not_found') return { exists: false, text: '' };
        throw err;
    }
}

module.exports = {
    id: 'codeforces',
    label: 'Codeforces',
    delayMs: 1000,
    handlePattern: /^[A-Za-z0-9_.-]{1,40}$/,
    verificationHint: 'the "First name", "Last name", "Organization" or "City" field of your Codeforces profile',
    profileUrl: (h) => `https://codeforces.com/profile/${encodeURIComponent(h)}`,
    fetchStats,
    fetchProfileText,
};
