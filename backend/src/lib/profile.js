// Parsing/validation for the user-editable parts of a profile, shared by
// registration and profile updates.
const { enabledPlatforms } = require('./collegePlatforms');

const BATCH_MIN = 1990;
const BATCH_MAX = 2100;

// college: whose enabled platforms apply. input: { leetcode: 'x', codeforces: '', ... } (unknown keys ignored)
// -> { handles: [[platformId, handle], ...] }  (blank entries dropped)  or  { error }
function parseHandles(college, input) {
    const handles = [];
    // Platforms the college has switched off are ignored, not errors (an old client may still send them)
    for (const platform of enabledPlatforms(college)) {
        const raw = input?.[platform.id];
        const handle = typeof raw === 'string' ? raw.trim() : '';
        if (!handle) continue;
        if (!platform.handlePattern.test(handle)) {
            return { error: `"${handle}" doesn't look like a valid ${platform.label} username` };
        }
        handles.push([platform.id, handle]);
    }
    return { handles };
}

// Only keys present in `input` are returned, so callers can tell "clear it"
// (null / '') apart from "leave it alone" (key absent).
// -> { values: { batch?, department? } }  or  { error }
function parseAcademic(college, input = {}) {
    const values = {};

    if ('batch' in input) {
        if (input.batch === null || input.batch === '') {
            values.batch = null;
        } else {
            const year = Number(input.batch);
            if (!Number.isInteger(year) || year < BATCH_MIN || year > BATCH_MAX) {
                return { error: `Batch must be a year between ${BATCH_MIN} and ${BATCH_MAX}` };
            }
            values.batch = year;
        }
    }

    if ('department' in input) {
        if (input.department === null || input.department === '') {
            values.department = null;
        } else if (!(college.departments || []).includes(input.department)) {
            return { error: 'Unknown department for this college' };
        } else {
            values.department = input.department;
        }
    }
    return { values };
}

module.exports = { parseHandles, parseAcademic };
