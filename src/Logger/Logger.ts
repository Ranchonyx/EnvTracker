import {createWriteStream, WriteStream, mkdirSync, existsSync} from "node:fs"
import {join} from "node:path"
import {EOL} from "node:os"
import {nextTick} from "node:process"
import {randomUUID} from "node:crypto"
import {LoggerConfigSpec} from "./types/Logger.js";

export enum LogLevel {
	DEBUG = 0,
	INFO = 1 << 1,
	WARN = 1 << 2,
	ERROR = 1 << 3
}

export type RegisteredLogger = {
	id: string;
	(message?: any, ...optionalParams: Array<any>): void;
	destroy: () => void;
};

export default class Logger {
	private static instance: Logger | undefined;
	private config: LoggerConfigSpec;

	private RegisteredLoggers: Map<RegisteredLogger["id"], WriteStream | null> = new Map<RegisteredLogger["id"], WriteStream | null>();

	public static GetInstance(config?: LoggerConfigSpec): Logger {
		if (!Logger.instance)
			Logger.instance = new Logger(config!);
		return Logger.instance;
	}

	private constructor(pConfig: LoggerConfigSpec) {
		this.config = pConfig;
	}

	public Destroy() {
		for (const [id, fstream] of this.RegisteredLoggers.entries()) {
			this.destroyLoggerById(id)
		}
		console.info(`Logger destroyed.`);
	}

	private destroyLoggerById = (id: string): void => {
		const stream = this.RegisteredLoggers.get(id);
		if (!stream)
			return;

		stream.end(`\nWriteStream closed at ${new Date().toISOString()}\n`);

		this.RegisteredLoggers.delete(id);
	}

	private writeLogFile(id: string, content?: string): void {
		if (!this.config?.logDirectoryPath)
			throw new Error("No log directory supplied in config!");

		const fstream = this.RegisteredLoggers.get(id);
		if (!fstream)
			return;

		fstream.cork();
		fstream.write(`${content || ""}${EOL}`);
		nextTick(() => fstream.uncork());
	}

	public createLogger<PrefixKind extends string>(basePrefix: PrefixKind, level: LogLevel = LogLevel.INFO, silent: boolean = false): RegisteredLogger {
		const targetTSF = this.config?.timestampFormat;
		const formatISO = targetTSF === "ISO-8601";
		const formatLocal = targetTSF === "local";

		const prefix = basePrefix.replaceAll(/[<>:"\/\\|?*]/g, "_");
		const myLogID = randomUUID();

		const shouldWriteLog = this.config!.logDirectoryPath !== undefined;

		const fWrite = (content: string) => {
			this.writeLogFile(myLogID, content);
		}

		const noop = (...args: Array<any>) => {
		}

		const logWriteFn = shouldWriteLog ? fWrite : noop;

		const loggerFn = (message?: any, ...optionalParams: Array<any>) => {
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
						return JSON.stringify(param);
					case "symbol":
						return `${param.toString()}`;
					case "function":
						return `(CallableFunction ${(param as Function).name})`;
					default:
						throw new Error(`typeof param resulted in an unknown type!`);
				}
			}).join(' ');

			logWriteFn(fmt);

			switch (level) {
				case LogLevel.DEBUG:
				case LogLevel.INFO:
					console.info(fmt);
					break;
				case LogLevel.WARN:
					console.warn(fmt);
					break;
				case LogLevel.ERROR:
					console.error(fmt);
					break;
				default:
					throw new Error(`[LOGGER] ${LogLevel[level]} `);
			}

		}

		const destroyLoggerFn = () => {
			this.destroyLoggerById(myLogID);
		}

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

		const myLogDir = join(this.config!.logDirectoryPath!, prefix);
		if (!existsSync(myLogDir))
			mkdirSync(myLogDir, {recursive: true});

		const wStreamOrNull: WriteStream | null = shouldWriteLog ? createWriteStream(join(myLogDir, `${LogLevel[level]}_${new Date().toLocaleDateString()}`), {
			encoding: "utf8",
			flags: "a"
		}) : null;

		this.RegisteredLoggers.set((loggerFn as RegisteredLogger).id, wStreamOrNull);

		return loggerFn as RegisteredLogger;
	}
}