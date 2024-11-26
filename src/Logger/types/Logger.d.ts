export type LoggerConfigSpec = Partial<{
	timestampFormat: "ISO-8601" | "local" | "default";
	logDirectoryPath: string;
}>;