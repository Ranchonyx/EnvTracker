/*
* Simple Implementation eines Lookup-Tables für Memoisierung
* */
export default class LUT_MEMOIZE<K extends string | number | symbol, V extends any> {
	private readonly keys: Array<K> = [];
	private readonly values: Array<V> = [];

	constructor(pKeys?: Array<K>, pValues?: Array<V>) {
		if (!pKeys || !pValues)
			return;

		if (pKeys.length !== pValues.length)
			throw new Error("Asymmetric key/value distribution. Ensure the amount of keys is the same as the amount of values!");

		this.keys = pKeys;
		this.values = pValues;
	}

	private keyIdx(key: K): number {
		return this.keys.indexOf(key);
	}

	public set(key: K, value: V): V {
		const kIdx = this.keyIdx(key);
		if (kIdx >= 0) {
			console.warn(`Overwriting data in LUT_MEMOIZE at index ${kIdx} for key ${String(key)} !`);
			this.keys[kIdx] = key;
			this.values[kIdx] = value;

			return value;
		}

		this.keys.push(key);
		this.values.push(value);

		return value;
	}

	public get(key: K): V | null {
		const kIdx = this.keyIdx(key);
		if (kIdx >= 0)
			return this.values[kIdx];

		return null;
	}

	public evict() {
		this.keys.splice(0, this.keys.length);
		this.values.splice(0, this.values.length);
	}
}