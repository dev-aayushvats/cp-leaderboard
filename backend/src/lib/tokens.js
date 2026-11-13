const crypto = require('crypto');

// Short code a user pastes into their LeetCode/Codeforces profile to prove ownership.
const newVerificationToken = () => 'lb-' + crypto.randomBytes(5).toString('hex');

module.exports = { newVerificationToken };
