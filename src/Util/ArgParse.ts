import {argv} from "node:process";
import {Guard} from "./Guard.js";

export default function ArgParse<K extends string>(args: Array<string> = argv): Map<K, string | number | boolean> {
	const argMap = new Map<K | string, string | number | boolean>();

	function parseVal(val: any): string | number | boolean {
		const num = parseInt(val);
		const bool = val === "true" || val === "false";
		if (!isNaN(num))
			return num;
		if (bool)
			return val === "true";
		return val + "";
	}

	if (!(args.length % 2 === 0))
		throw new Error(`Argument k-v pairs not divisible by two!`);

	for (let i = 0; i < args.length; i++) {
		Guard.CastAs<Array<string>>(args)
		argMap.set(args[i++].replace(/^-*/g, ""), parseVal(args[i]));
	}

	return argMap as Map<K, string | number | boolean>;
}