import { argv } from "node:process";
import { Guard } from "./Guard.js";
export default function ArgParse(args = argv) {
    const argMap = new Map();
    function parseVal(val) {
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
        Guard.CastAs(args);
        argMap.set(args[i++].replace(/^-*/g, ""), parseVal(args[i]));
    }
    return argMap;
}
//# sourceMappingURL=ArgParse.js.map