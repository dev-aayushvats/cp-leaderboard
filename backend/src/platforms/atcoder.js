const axios = require('axios');
const { PlatformError } = require('./errors');

const SITE = 'https://atcoder.jp';
// Community-run API (kenkoooo) for accepted-problem counts; AtCoder has no official one.
const SOLVED_API = 'https://kenkoooo.com/atcoder/atcoder-api/v3/user/ac_rank';

const http = (url) => axios.get(url, { timeout: 15000 });

// Contest history -> { rating, maxRating } (AtCoder rating = rating after the latest rated contest)
async function fetchHistory(handle) {
    try {
        const { data } = await http(`${SITE}/users/${encodeURIComponent(handle)}/history/json`);
        const rated = data.filter((c) => c.IsRated);
        return {
            rating: rated.length ? rated[rated.length - 1].NewRating : 0,
            maxRating: rated.reduce((m, c) => Math.max(m, c.NewRating), 0),
            contests: data.length,
        };
    } catch (err) {
        throw new PlatformError('unavailable', `AtCoder unreachable: ${err.message}`);
    }
}

// Accepted count, null if the user has no submissions on record, throws if the service is down.
async function fetchSolved(handle) {
    try {
        const { data } = await http(`${SOLVED_API}?user=${encodeURIComponent(handle)}`);
        return data.count ?? 0;
    } catch (err) {
        if (err.response?.status === 404) return null;
        throw err;
    }
}

async function fetchStats(handle) {
    const history = await fetchHistory(handle);

    let solved;
    try {
        solved = await fetchSolved(handle);
    } catch {
        // The solved-count service is down but AtCoder itself answered: keep the
        // rating fresh and leave the previous solved count untouched (null).
        return { rating: history.rating, maxRating: history.maxRating, solved: null };
    }

    // AtCoder answers [] for both "never competed" and "no such user", so a
    // user with no contests and no submissions is treated as not found.
    if (history.contests === 0 && solved === null) {
        throw new PlatformError('not_found', `No AtCoder user named "${handle}" (or no activity yet)`);
    }
    return { rating: history.rating, maxRating: history.maxRating, solved: solved ?? 0 };
}

const stripTags = (html) =>
    html.replace(/<[^>]*>/g, ' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
        .replace(/\s+/g, ' ').trim();

async function fetchProfileText(handle) {
    let html;
    try {
        ({ data: html } = await http(`${SITE}/users/${encodeURIComponent(handle)}`));
    } catch (err) {
        if (err.response?.status === 404) return { exists: false, text: '' };
        throw new PlatformError('unavailable', `AtCoder unreachable: ${err.message}`);
    }
    const row = String(html).match(/<th[^>]*>\s*Affiliation\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
    return { exists: true, text: row ? stripTags(row[1]) : '' };
}

module.exports = {
    id: 'atcoder',
    label: 'AtCoder',
    delayMs: 1500,
    handlePattern: /^[A-Za-z0-9_]{1,16}$/,
    verificationHint: 'the "Affiliation" field of your AtCoder profile (Settings → Profile)',
    profileUrl: (h) => `https://atcoder.jp/users/${encodeURIComponent(h)}`,
    fetchStats,
    fetchProfileText,
};
