import LUT_MEMOIZE from "./LUT.js";
import {crc32} from "node:zlib";

/*
* Memoisierung:
* "Zwischenklemmen" eines Caches vor dem eigentlichen Funktionsaufruf.
* Wenn bereits ein Ergebnis für die Checksumme der Parameter vorliegt, gib dies aus dem Cache zurück.
* Wenn nicht, dann führe die Funktion aus und speichere ihr Ergebnis im Cache.
* Dies führt zu schnelleren Ausführungszeiten, sobald die Funktion einmal ausgeführt wurde.
*
* Anmerkung:
* Die Funktion *muss* deterministisch sein, d.h:
* Für jede Kombination an Argumenten muss genau ein (1) ergebnis vorliegen.
* Das Verhalten ist auch gefährlich für Funktionen, die Werte von einem Server und System abrufen, die sich durch Dritte ändern können
* */

//Memoisieren von asynchronen Funktionen
export function MemoizeAsync<T extends Function>(baseFn: T, lut: LUT_MEMOIZE<number, any>, fnName?: string): T {
	//console.warn(`Memoizing ${baseFn.name} ${baseFn}!`);
	const replaceFn = async (...args: Array<any>) => {
		const args_chk = crc32(JSON.stringify(args.length > 0 ? args : `${baseFn.name}([])`));
		const lutVal = lut.get(args_chk);
		if (lutVal === null) {
			//console.info(`[!] Executing ${baseFn.name}`);
			const val = await baseFn(...args);
			return lut.set(args_chk, val);
		} else {
/*
			if (fnName)
				console.warn(`Fetched result for ${fnName} from cache`);
*/
			return lutVal;
		}
	};

	return Object.defineProperty(replaceFn, "name", {
		value: `AsyncMemoized ${baseFn.name}`,
		enumerable: true,
		configurable: false,
		writable: false
	}) as unknown as T;
}

//Memoisieren von synchronen Funktionen
export function MemoizeSync<T extends Function>(baseFn: T, lut: LUT_MEMOIZE<number, any>, fnName?: string): T {
	const replaceFn = (...args: Array<any>) => {
		const args_chk = crc32(JSON.stringify(args.length > 0 ? args : `${baseFn.name}([])`));
		const lutVal = lut.get(args_chk);
		if (lutVal === null) {
			const val = baseFn(...args);
			return lut.set(args_chk, val);
		} else {
/*
			if(fnName)
				console.warn(`Fetched result for ${fnName} from cache`);
*/
			return lutVal;
		}
	};

	return Object.defineProperty(replaceFn, "name", {
		value: `Memoized ${baseFn.name}`,
		enumerable: true,
		configurable: false,
		writable: false
	}) as unknown as T;
}