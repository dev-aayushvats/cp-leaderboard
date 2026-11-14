// An instant hint for the common case of entering a shared suffix (ac.in, edu.in, co.uk, edu...) as a college's
// email domain, which would let EVERY institution under it join. This is only a quick check on the shapes people
// actually type; the server checks against the full Public Suffix List and is the authority.
const SHARED = /^(ac|edu|sch|res|gov|nic|org|com|net|co)\.[a-z]{2}$|^(com|edu|org|net|gov|ac|co|io|in|uk|us)$/;

/** @param {string} text comma-separated domains. @returns {string|null} a problem to show, or null */
export function sharedSuffixProblem(text) {
  const bad = String(text || "")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .find((d) => SHARED.test(d));
  if (!bad) return null;
  return `"${bad}" is shared by many organisations, so it would let all of them join. Use your college's own domain, such as yourcollege.${bad.includes(".") ? bad : "edu"}.`;
}
