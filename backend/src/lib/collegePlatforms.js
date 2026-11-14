// Which platforms a college has switched on. Everything that lists, accepts or syncs
// platform data goes through here so the admin's choice applies everywhere.
const platforms = require('../platforms');

const disabledOf = (college) => college?.disabled_platforms || [];
const isEnabled = (college, id) => !disabledOf(college).includes(id);
const enabledPlatforms = (college) => platforms.list.filter((p) => isEnabled(college, p.id));

// The admin's full picture: every platform the software supports, flagged on/off.
const describeAll = (college) => platforms.list.map((p) => ({ id: p.id, label: p.label, enabled: isEnabled(college, p.id) }));

// Input is the list of platform ids that should be ON. -> { value: [disabled ids] } | { error }
function parseEnabled(input) {
    if (!Array.isArray(input)) return { error: 'enabled_platforms must be a list of platform ids' };
    const unknown = input.find((id) => !platforms.get(id));
    if (unknown !== undefined) return { error: `Unknown platform "${unknown}"` };
    const on = new Set(input);
    if (on.size === 0) return { error: 'Keep at least one platform enabled' };
    return { value: platforms.ids.filter((id) => !on.has(id)) };
}

module.exports = { disabledOf, isEnabled, enabledPlatforms, describeAll, parseEnabled };
