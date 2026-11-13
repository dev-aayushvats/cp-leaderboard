// Clients for the third-party platform APIs. Used by the sync worker
// (ratings) and by handle verification (profile text).
const axios = require('axios');

const LEETCODE_API_URL = 'https://leetcode.com/graphql';
const CODEFORCES_API_URL = 'https://codeforces.com/api/user.info';
const LEETCODE_HEADERS = { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' };

// --- Ratings (worker) -------------------------------------------------------

async function fetchLeetCodeData(handle) {
    const query = `
    query userProfile($username: String!) {
        userContestRanking(username: $username) { rating }
        matchedUser(username: $username) {
            submitStats { acSubmissionNum { difficulty count } }
        }
    }`;

    try {
        const response = await axios.post(LEETCODE_API_URL,
            { query, variables: { username: handle } },
            { headers: LEETCODE_HEADERS });

        if (response.data.errors) return null;

        const rating = response.data.data.userContestRanking?.rating || 0;
        // Index 0 is 'All' difficulties
        const solved = response.data.data.matchedUser?.submitStats?.acSubmissionNum[0]?.count || 0;
        return { rating, solved, maxRating: 0 };
    } catch (error) {
        console.error(`Error LeetCode ${handle}:`, error.message);
        return null;
    }
}

async function fetchCodeforcesData(handle) {
    try {
        const response = await axios.get(`${CODEFORCES_API_URL}?handles=${encodeURIComponent(handle)}`);
        if (response.data.status === 'OK') {
            const user = response.data.result[0];
            return { rating: user.rating || 0, maxRating: user.maxRating || 0, solved: 0 };
        }
        return null;
    } catch (error) {
        console.error(`Error Codeforces ${handle}:`, error.message);
        return null;
    }
}

// --- Ownership verification -------------------------------------------------

// Where users are told to put their verification code, per platform.
const VERIFICATION_FIELDS = {
    leetcode: 'the "Summary" (About Me) section of your LeetCode profile',
    codeforces: 'the "First name", "Last name", "Organization" or "City" field of your Codeforces profile',
};

// Returns { exists, text }: the free-text profile fields a user controls.
// Throws if the platform could not be reached (caller should report a 502).
async function fetchProfileText(platform, handle) {
    if (platform === 'leetcode') {
        const query = `query p($u: String!) { matchedUser(username: $u) { profile { aboutMe realName } } }`;
        const { data } = await axios.post(LEETCODE_API_URL,
            { query, variables: { u: handle } },
            { headers: LEETCODE_HEADERS, timeout: 10000 });
        const profile = data?.data?.matchedUser?.profile;
        if (!profile) return { exists: false, text: '' };
        return { exists: true, text: `${profile.aboutMe || ''} ${profile.realName || ''}` };
    }

    if (platform === 'codeforces') {
        try {
            const { data } = await axios.get(`${CODEFORCES_API_URL}?handles=${encodeURIComponent(handle)}`,
                { timeout: 10000 });
            const u = data.result[0];
            return { exists: true, text: [u.firstName, u.lastName, u.organization, u.city].filter(Boolean).join(' ') };
        } catch (err) {
            // Codeforces answers 400 + {status:'FAILED'} for unknown handles.
            if (err.response?.data?.status === 'FAILED') return { exists: false, text: '' };
            throw err;
        }
    }

    throw new Error(`Unsupported platform: ${platform}`);
}

module.exports = { fetchLeetCodeData, fetchCodeforcesData, fetchProfileText, VERIFICATION_FIELDS };
