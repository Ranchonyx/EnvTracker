import { existsSync } from "node:fs";
import { readFileSync } from "fs";
import ArgParse from "./Util/ArgParse.js";
import Logger, { LogLevel } from "./Logger/Logger.js";
import MariaDBConnector from "./MariaDBConnector/MariaDBConnector.js";
import AuthTokenStore from "./WebUI/AuthTokenStore.js";
import MariaDBSessionStore from "./WebUI/MariaDBSessionStore.js";
import WebUI from "./WebUI/WebUI.js";
import SocketReceiver from "./TCPSocketReceiver/TCPSocketReceiver.js";
const ParsedArgs = ArgParse(process.argv.slice(2));
const configPath = ParsedArgs.get("config");
if (!configPath && !existsSync(configPath))
    throw new Error(`Required parameter --config not in parameter set!`);
const Configuration = JSON.parse(readFileSync(configPath, "utf8"));
const LogManager = Logger.GetInstance(Configuration.Logging);
const log = LogManager.createLogger("System");
const mariadb_logger = LogManager.createLogger("MariaDB");
const mariadb = MariaDBConnector.GetInstance(Configuration.MariaDB, mariadb_logger);
const CreateRequiredDatabaseStructureResult = await mariadb.QueryMany([
    "CREATE TABLE IF NOT EXISTS credential (guid UUID PRIMARY KEY NOT NULL DEFAULT UUID(), id VARCHAR(255), hash VARCHAR(255));",
    "CREATE TABLE IF NOT EXISTS station (guid UUID PRIMARY KEY NOT NULL DEFAULT UUID(), credential_guid UUID UNIQUE NOT NULL, name VARCHAR(255) NOT NULL, status_flags BINARY(2), serial_number varchar(64), battery INTEGER DEFAULT 0, solar_panel INTEGER DEFAULT 0);",
    "CREATE TABLE IF NOT EXISTS sensor (guid UUID PRIMARY KEY NOT NULL DEFAULT UUID(), station_guid UUID UNIQUE NOT NULL, name VARCHAR(255) NOT NULL, status_flags BINARY(2), row TEXT);",
    "CREATE TABLE IF NOT EXISTS measurement (guid UUID PRIMARY KEY NOT NULL DEFAULT UUID(), sensor_guid UUID UNIQUE NOT NULL, timestamp VARCHAR(30) NOT NULL, unit VARCHAR(16), value DECIMAL);"
]);
if (!CreateRequiredDatabaseStructureResult) {
    log(`Error: Unable to create required database structure!`);
    process.exit(1);
}
const restLogger = LogManager.createLogger("REST-API", LogLevel.INFO);
const webserverLogger = LogManager.createLogger("WebServer", LogLevel.WARN);
const websocketLogger = LogManager.createLogger("WebSockets", LogLevel.INFO);
const authTokenStoreWs = new AuthTokenStore("EnvTracker/Websockets", "E.Lauter/F.Janetzki", "EnvTrack/Users", websocketLogger);
const sessionStore = await MariaDBSessionStore.Instantiate(mariadb);
const webui_logger = LogManager.createLogger("WebUI", LogLevel.INFO);
const webui = new WebUI(8888, "/home", restLogger, websocketLogger, webserverLogger, mariadb, authTokenStoreWs, sessionStore);
const srv = new SocketReceiver(8787);
srv.Start();
//# sourceMappingURL=index.js.map