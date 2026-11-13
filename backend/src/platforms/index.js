// Platform registry. To add a platform: create ./<id>.js exporting
//   { id, label, delayMs, handlePattern, verificationHint, profileUrl(handle),
//     fetchStats(handle) -> { rating, maxRating, solved|null }  (throws PlatformError),
//     fetchProfileText(handle) -> { exists, text } }
// and list it below. The API, worker and admin tools pick it up automatically;
// only the frontend's display styling (src/utils/platforms.js) is per-platform.
const list = [require('./leetcode'), require('./codeforces'), require('./atcoder')];
const byId = Object.fromEntries(list.map((p) => [p.id, p]));

module.exports = {
    list,
    ids: list.map((p) => p.id),
    get: (id) => byId[id] || null,
    // Public description sent to the frontend
    describe: () => list.map((p) => ({ id: p.id, label: p.label })),
};
