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

const normalizeDomains = (list) =>
    [...new Set(list.map((d) => String(d).trim().toLowerCase().replace(/^@/, '')).filter(Boolean))];

const isValidDomain = (d) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d);

module.exports = { normalizeEmail, emailAllowed, domainError, normalizeDomains, isValidDomain };
