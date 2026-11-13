const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

// A college with no email_domains is open; otherwise the email's domain (or a
// subdomain of it, e.g. cs.mit.edu for mit.edu) must be on the whitelist.
const emailAllowed = (college, email) => {
    const domains = college.email_domains || [];
    if (domains.length === 0) return true;
    const domain = email.split('@')[1];
    if (!domain) return false;
    return domains.some((d) => domain === d || domain.endsWith('.' + d));
};

const domainError = (college) =>
    `Registration for ${college.name} is limited to: ${college.email_domains.map((d) => '@' + d).join(', ')}`;

// LeetCode and Codeforces handles: letters, digits, '_', '-', '.'
const isValidHandle = (h) => /^[A-Za-z0-9_.-]{1,40}$/.test(h);

const normalizeDomains = (list) =>
    [...new Set(list.map((d) => String(d).trim().toLowerCase().replace(/^@/, '')).filter(Boolean))];

const isValidDomain = (d) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d);

const PLATFORMS = ['leetcode', 'codeforces'];

module.exports = { normalizeEmail, emailAllowed, domainError, isValidHandle, normalizeDomains, isValidDomain, PLATFORMS };
