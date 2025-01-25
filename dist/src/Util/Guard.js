class GuardError extends Error {
    constructor(pMessage) {
        super(pMessage);
        Error.captureStackTrace ||= () => { };
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, GuardError);
        }
        Object.setPrototypeOf(this, GuardError.prototype);
    }
}
export class Guard {
    static AgainstNull(param) {
        if (param === null)
            throw new GuardError(`Assertion failed, "param" (${param}) was null!`);
    }
    static AgainstUndefined(param) {
        if (param === undefined)
            throw new GuardError(`Assertion failed, "param" (${param}) was undefined!`);
    }
    static AgainstNullish(param) {
        Guard.AgainstUndefined(param);
        Guard.AgainstNull(param);
    }
    static CastAs(param) {
        Guard.AgainstNullish(param);
    }
    static CastAssert(tgt, expr) {
        Guard.AgainstNullish(tgt);
        Guard.AgainstNullish(expr);
    }
}
//# sourceMappingURL=Guard.js.map