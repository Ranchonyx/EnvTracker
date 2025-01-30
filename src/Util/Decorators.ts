import LUT_MEMOIZE from "./LUT.js";
import {MemoizeAsync, MemoizeSync} from "./Memo.js";

/**
 * Loggt die Dauer der asynchronen Operation in ms
 * @param operation Bezeichnung der Operation
 */
export function MeasurePerfAsync(operation: string) {
	return (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) => {
		const originalMethod = descriptor.value;

		descriptor.value = async function (...args: any[]) {
			const startTime = performance.now();
			const result = await originalMethod.apply(this, args);
			const endTime = performance.now();
			const timespan = endTime - startTime;

			console.warn(`MeasurePerfAsync[${operation}] took ~${timespan.toFixed(2)} ms`);

			return result;
		}

		return descriptor;
	}
}

/*
* Loggt die Dauer der synchronen Operation in ms
* @param operation Bezeichnung der Operation
* */
export function MeasurePerfSync(operation: string) {
	return (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) => {
		const originalMethod = descriptor.value;

		descriptor.value = function (...args: any[]) {
			const startTime = performance.now();
			const result = originalMethod.apply(this, args);
			const endTime = performance.now();
			const timespan = endTime - startTime;

			console.warn(`MeasurePerfSync[${operation}] took ~${timespan.toFixed(2)} ms`);

			return result;
		}

		return descriptor;
	}
}

/*
* Memoisiert eine asynchrone Methode in einer Klasse mit eigenem LUT
* */
export function AsyncMemo(functionName?: string) {
	return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
		const originalMethod = descriptor.value;

		descriptor.value = async function (this: any, ...args: Array<any>): Promise<any> {
			const bound = originalMethod.bind(this);
			const memoized = MemoizeAsync(bound, new LUT_MEMOIZE<number, any>(), functionName);
			return memoized.apply(this, args);
		};

		return descriptor;
	}
}

export function SyncMemo(functionName?: string) {
	return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
		const originalMethod = descriptor.value;

		descriptor.value = function (this: any, ...args: Array<any>): any {
			const bound = originalMethod.bind(this);
			const memoized = MemoizeSync(bound, new LUT_MEMOIZE<number, any>(), functionName);
			return memoized.apply(this, args);
		};

		return descriptor;
	}
}