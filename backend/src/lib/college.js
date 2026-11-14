const psl = require('psl');

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

// A public suffix is a registry-level domain that many unrelated organisations register under: ac.in, edu.in,
// co.uk, edu.au, github.io... Allowing one as a college's email domain would let EVERY institution under it join
// (ac.in would admit all Indian universities). The Public Suffix List is the authoritative source.
// A name that merely isn't on the list (college.local, an internal domain) is fine.
function isPublicSuffix(domain) {
    const p = psl.parse(String(domain));
    return p.listed === true && p.domain === null;
}

// Why a domain can't be used as a college's email domain, or null when it's fine.
function domainProblem(domain) {
    if (!isValidDomain(domain)) return `"${domain}" is not a valid domain.`;
    if (isPublicSuffix(domain)) {
        return `"${domain}" is shared by many organisations, so it would let all of them join. ` +
               `Use your college's own domain, such as yourcollege.${domain}.`;
    }
    return null;
}

module.exports = { normalizeEmail, emailAllowed, domainError, normalizeDomains, isValidDomain, isPublicSuffix, domainProblem };
