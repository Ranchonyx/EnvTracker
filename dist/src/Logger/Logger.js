import { createWriteStream, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { EOL } from "node:os";
import { nextTick } from "node:process";
import { randomUUID } from "node:crypto";
export var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 2] = "INFO";
    LogLevel[LogLevel["WARN"] = 4] = "WARN";
    LogLevel[LogLevel["ERROR"] = 8] = "ERROR";
})(LogLevel || (LogLevel = {}));
export default class Logger {
    static instance;
    config;
    RegisteredLoggers = new Map();
    static GetInstance(config) {
        if (!Logger.instance)
            Logger.instance = new Logger(config);
        return Logger.instance;
    }
    constructor(pConfig) {
        this.config = pConfig;
    }
    Destroy() {
        for (const [id] of this.RegisteredLoggers.entries()) {
            this.destroyLoggerById(id);
        }
        console.info(`Logger destroyed.`);
    }
    destroyLoggerById = (id) => {
        const stream = this.RegisteredLoggers.get(id);
        if (!stream)
            return;
        stream.end(`\nWriteStream closed at ${new Date().toISOString()}\n`);
        this.RegisteredLoggers.delete(id);
    };
    writeLogFile(id, content) {
        if (!this.config?.logDirectoryPath)
            throw new Error("No log directory supplied in config!");
        const fstream = this.RegisteredLoggers.get(id);
        if (!fstream)
            return;
        fstream.cork();
        fstream.write(`${content || ""}${EOL}`);
        nextTick(() => fstream.uncork());
    }
    createMany(prefixes, level = LogLevel.INFO, silent = false) {
        const loggerMap = new Map;
        for (const prefix of prefixes)
            loggerMap.set(prefix, this.createLogger(prefix, level, silent));
        return loggerMap;
    }
    createLogger(basePrefix, level = LogLevel.INFO, silent = false) {
        const targetTSF = this.config?.timestampFormat;
        const formatISO = targetTSF === "ISO-8601";
        const formatLocal = targetTSF === "local";
        const prefix = basePrefix.replaceAll(/[<>:"\/\\|?*]/g, "_");
        const myLogID = randomUUID();
        const shouldWriteLog = this.config.logDirectoryPath !== undefined;
        const fWrite = (content) => {
            this.writeLogFile(myLogID, content);
        };
        const noop = (..._args) => {
        };
        const logWriteFn = shouldWriteLog ? fWrite : noop;
        function makeAsync(fn) {
            return (fmt) => setImmediate(() => fn(fmt));
        }
        const logPrintFn = (arg, level) => {
            switch (level) {
                case LogLevel.DEBUG:
                case LogLevel.INFO:
                    console.info(arg);
                    break;
                case LogLevel.WARN:
                    console.warn(arg);
                    break;
                case LogLevel.ERROR:
                    console.error(arg);
                    break;
                default:
                    throw new Error(`[LOGGER] ${LogLevel[level]} `);
            }
        };
        const loggerFn = (message, ...optionalParams) => {
            if (silent)
                return;
            const timeFormat = formatISO ? new Date().toISOString() : (formatLocal ? new Date().toLocaleString() : new Date().toString());
            const FormatPrefix = `[${timeFormat}] [${prefix}]`.padEnd(64);
            let fmt = `${FormatPrefix} `;
            fmt += [message, ...optionalParams].map(param => {
                switch (typeof param) {
                    case "string":
                    case "bigint":
                    case "boolean":
                    case "number":
                    case "undefined":
                        return `${param}`;
                    case "object":
                        if (param instanceof Buffer)
                            return "Binary " + param.toString("hex");
                        return JSON.stringify(param);
                    case "symbol":
                        return `${param.toString()}`;
                    case "function":
                        return `(CallableFunction ${param.name})`;
                    default:
                        throw new Error(`typeof param resulted in an unknown type!`);
                }
            }).join(' ');
            logWriteFn(fmt);
            logPrintFn(fmt, level);
        };
        const destroyLoggerFn = () => {
            this.destroyLoggerById(myLogID);
        };
        Object.defineProperties(loggerFn, {
            "id": {
                value: myLogID,
                enumerable: true,
                configurable: false,
                writable: false
            },
            "destroyLoggerFn": {
                value: destroyLoggerFn,
                enumerable: true,
                configurable: false,
                writable: false
            }
        });
        const myLogDir = join(this.config.logDirectoryPath, prefix);
        if (!existsSync(myLogDir))
            mkdirSync(myLogDir, { recursive: true });
        const wStreamOrNull = shouldWriteLog ? createWriteStream(join(myLogDir, `${LogLevel[level]}_${new Date().toLocaleDateString()}`), {
            encoding: "utf8",
            flags: "a"
        }) : null;
        this.RegisteredLoggers.set(loggerFn.id, wStreamOrNull);
        return loggerFn;
    }
}
//# sourceMappingURL=Logger.js.map