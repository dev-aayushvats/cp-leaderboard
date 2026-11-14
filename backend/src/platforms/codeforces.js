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

// Distinct problems with an accepted submission (the same problem solved twice counts once; gym
// contests, ids >= 100000, aren't counted). user.status returns every submission, so this is the
// heavier call: a few KB for a student, a few MB for a grandmaster.
async function fetchSolved(handle) {
    const { data } = await axios.get(`https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}`, { timeout: 30000 });
    if (data.status !== 'OK' || !Array.isArray(data.result)) throw new Error(data.comment || 'unexpected response');
    const solved = new Set();
    for (const s of data.result) {
        const p = s.problem;
        if (s.verdict === 'OK' && p?.contestId < 100000) solved.add(`${p.contestId}/${p.index}`);
    }
    return solved.size;
}

async function fetchStats(handle) {
    const user = await getUser(handle);
    let solved = null;
    try {
        solved = await fetchSolved(handle);
    } catch {
        // The rating is fresh, only the solved count failed: leave the previous count untouched (null)
        // rather than failing the whole sync.
    }
    return { rating: user.rating || 0, maxRating: user.maxRating || 0, solved };
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
    delayMs: 2000, // Codeforces allows about one request per 2s, and each handle now needs two
    handlePattern: /^[A-Za-z0-9_.-]{1,40}$/,
    verificationHint: 'the "First name", "Last name", "Organization" or "City" field of your Codeforces profile',
    profileUrl: (h) => `https://codeforces.com/profile/${encodeURIComponent(h)}`,
    fetchStats,
    fetchProfileText,
};
