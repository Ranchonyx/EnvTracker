export function Omit<T, K extends keyof T>(object: T, key: K): Omit<T, K> {
	const copy: T = Object(object);
	delete copy[key];

	return copy;
}

export function OmitMany<T, K extends keyof T>(objects: Array<T>, key: K): Array<Omit<T, K>> {
	return objects.map(object => Omit<T, K>(object, key));
}