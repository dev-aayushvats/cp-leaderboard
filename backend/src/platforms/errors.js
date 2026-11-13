// kind: 'not_found'   - the platform says this handle doesn't exist (don't retry)
//       'unavailable' - network error, rate limit, platform down (worth retrying)
class PlatformError extends Error {
    constructor(kind, message) {
        super(message);
        this.name = 'PlatformError';
        this.kind = kind;
    }
}

module.exports = { PlatformError };
