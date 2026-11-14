const axios = require('axios');
const { PlatformError } = require('./errors');

const API_URL = 'https://leetcode.com/graphql';
const HEADERS = { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' };

async function gql(query, variables) {
    try {
        const { data } = await axios.post(API_URL, { query, variables }, { headers: HEADERS, timeout: 15000 });
        return data;
    } catch (err) {
        throw new PlatformError('unavailable', `LeetCode unreachable: ${err.message}`);
    }
}

// Highest rating after any contest the user actually took part in (history includes skipped weeks).
function maxContestRating(history, current) {
    const ratings = (history || []).filter((h) => h.attended).map((h) => h.rating);
    return Math.round(Math.max(0, current?.rating || 0, ...ratings));
}

async function fetchStats(handle) {
    const data = await gql(
        `query ($u: String!) {
            userContestRanking(username: $u) { rating }
            userContestRankingHistory(username: $u) { attended rating }
            matchedUser(username: $u) { submitStats { acSubmissionNum { difficulty count } } }
        }`,
        { u: handle }
    );
    const d = data?.data;
    if (d && d.matchedUser === null) throw new PlatformError('not_found', `No LeetCode user named "${handle}"`);
    if (!d?.matchedUser) throw new PlatformError('unavailable', 'LeetCode returned an unexpected response');

    const counts = d.matchedUser.submitStats?.acSubmissionNum || [];
    const all = counts.find((c) => c.difficulty === 'All') || counts[0];
    return {
        rating: Math.round(d.userContestRanking?.rating || 0),
        maxRating: maxContestRating(d.userContestRankingHistory, d.userContestRanking),
        solved: all?.count ?? 0,
    };
}

async function fetchProfileText(handle) {
    const data = await gql(
        'query ($u: String!) { matchedUser(username: $u) { profile { aboutMe realName } } }',
        { u: handle }
    );
    const profile = data?.data?.matchedUser?.profile;
    if (!profile) return { exists: false, text: '' };
    return { exists: true, text: `${profile.aboutMe || ''} ${profile.realName || ''}` };
}

module.exports = {
    id: 'leetcode',
    label: 'LeetCode',
    delayMs: 2000, // pause between handles, to stay under LeetCode's rate limits
    handlePattern: /^[A-Za-z0-9_-]{1,40}$/,
    verificationHint: 'the "Summary" (About Me) section of your LeetCode profile',
    profileUrl: (h) => `https://leetcode.com/u/${encodeURIComponent(h)}/`,
    fetchStats,
    fetchProfileText,
};
