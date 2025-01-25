class GuardError extends Error {
	constructor(pMessage: string) {
		super(pMessage);

		Error.captureStackTrace ||= () => {};
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, GuardError);
		}

		Object.setPrototypeOf(this, GuardError.prototype);
	}
}

export class Guard {
	public static AgainstNull<T>(param: T): asserts param is Exclude<T, null> {
		if (param === null)
			throw new GuardError(`Assertion failed, "param" (${param}) was null!`);
	}

	public static AgainstUndefined<T>(param: T): asserts param is Exclude<T, undefined> {
		if (param === undefined)
			throw new GuardError(`Assertion failed, "param" (${param}) was undefined!`);
	}

	public static AgainstNullish<T>(param: T): asserts param is Exclude<Exclude<T, null>, undefined> {
		Guard.AgainstUndefined(param);
		Guard.AgainstNull(param);
	}

	public static CastAs<T>(param: unknown): asserts param is T {
		Guard.AgainstNullish(param);
	}

	public static CastAssert<T>(tgt: unknown, expr: boolean): asserts tgt is T {
		Guard.AgainstNullish(tgt);
		Guard.AgainstNullish(expr);
	}
}