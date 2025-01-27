import {LoggerConfigSpec} from "./Logger/types/Logger.js";
import {MariaDBConnectorConfigSpec} from "./MariaDBConnector/types/MariaDBConnector.js";
import {existsSync} from "node:fs";
import {readFileSync} from "fs";
import ArgParse from "./Util/ArgParse.js";
import Logger, {LogLevel} from "./Logger/Logger.js";
import MariaDBConnector from "./MariaDBConnector/MariaDBConnector.js";
import AuthTokenStore from "./WebUI/AuthTokenStore.js";
import MariaDBSessionStore from "./WebUI/MariaDBSessionStore.js";
import AppServer from "./WebUI/AppServer.js";
import SocketReceiver from "./TCPSocketReceiver/TCPSocketReceiver.js";
import {
	AddSensorMeasurement,
	CreateSensorIfNotExists,
	TryParseMeasurementString
} from "./Util/MeasurementUtil.js";
import EventBus from "./EventBus/EventBus.js";
import {schedule} from "node-cron";
import PredictionService from "./Services/PredictionService/prediction.service.js";
import Service from "./Services/MeasurementService/measurement.service.js";

export type Config = {
	MariaDB: MariaDBConnectorConfigSpec;
	Logging: LoggerConfigSpec;
	Prediction: {
		modelDirectory: string;
	}
}

const ParsedArgs = ArgParse<"config">(process.argv.slice(2));
const configPath = ParsedArgs.get("config") as string;

if (!configPath && !existsSync(configPath))
	throw new Error(`Required parameter --config not in parameter set!`);

const Configuration: Config = JSON.parse(readFileSync(configPath, "utf8"));

const LogManager = Logger.GetInstance(Configuration.Logging);
const log = LogManager.createLogger("System");

const mariadb_logger = LogManager.createLogger("MariaDB");
const mariadb = MariaDBConnector.GetInstance(Configuration.MariaDB, mariadb_logger);

const CreateRequiredDatabaseStructureResult = await mariadb.QueryMany([
	//Base tables
	"CREATE TABLE IF NOT EXISTS credential (guid UUID PRIMARY KEY NOT NULL DEFAULT UUID(), id VARCHAR(255), hash VARCHAR(255));",
	"CREATE TABLE IF NOT EXISTS station (guid UUID PRIMARY KEY NOT NULL DEFAULT UUID(), credential_guid UUID NOT NULL, name VARCHAR(255) NOT NULL, status_flags BINARY(2), serial_number varchar(64), battery INTEGER DEFAULT 0, solar_panel INTEGER DEFAULT 0);",
	"CREATE TABLE IF NOT EXISTS sensor (guid UUID PRIMARY KEY NOT NULL DEFAULT UUID(), station_guid UUID NOT NULL, name VARCHAR(255) NOT NULL, status_flags BINARY(2), row TEXT);",
	"CREATE TABLE IF NOT EXISTS measurement (guid UUID PRIMARY KEY NOT NULL DEFAULT UUID(), sensor_guid UUID NOT NULL, timestamp VARCHAR(30) NOT NULL, unit VARCHAR(32), value DECIMAL(10, 2), name VARCHAR(32));",

	//Extra information tables
	"CREATE TABLE IF NOT EXISTS station_extra (station_guid UUID UNIQUE NOT NULL, location varchar(2048), description varchar(4096));",

	//Prediction table
	"CREATE TABLE IF NOT EXISTS measurement_prediction (prediction_guid UUID PRIMARY KEY NOT NULL DEFAULT UUID(), timestamp VARCHAR(30), unit VARCHAR(32), value DECIMAL(10, 2), name VARCHAR(32))",

	//Create compound views here
	"CREATE OR REPLACE VIEW station0 AS SELECT s.*, se.* FROM station s LEFT JOIN station_extra se ON s.guid = se.station_guid;",

	//Create triggers here
	`
		CREATE OR REPLACE TRIGGER oninsert_station_create_extra
		AFTER INSERT ON station
		FOR EACH ROW
		BEGIN
			-- Automatisch record in station_extra erzeugen
			INSERT INTO station_extra (station_guid, location, description) values (NEW.guid, '', '');
		END;
	`,
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

const bus = new EventBus();
const wire = bus.getChannel("sockets-to-webui");

const appServer = new AppServer(8888, "/home", restLogger, websocketLogger, webserverLogger, mariadb, authTokenStoreWs, sessionStore, wire, Configuration.Prediction);

await appServer.InitialiseServices();
await appServer.Start();

const socketSrvLogger = LogManager.createLogger("TCP-Sockets", LogLevel.INFO);
const srv = new SocketReceiver(8787, socketSrvLogger, async (station_id, data) => {
	//Trim off unnecessary semicolon
	const sensorDataUTF8 = data.toString("utf8").slice(0, -1);

	const parsedSensorData = TryParseMeasurementString(sensorDataUTF8);
	if (!parsedSensorData) {
		console.log(`Received invalid sensor data: ${sensorDataUTF8}`);
		return;
	}

	console.log(`Received ${parsedSensorData.length} records from station ${station_id}`);

	//On incoming new records, notify all websockets for the source station that there is new data available in the database...
	for (const recordArray of parsedSensorData) {
		const sensorName = recordArray.sensorName;
		await CreateSensorIfNotExists(mariadb, station_id, sensorName);

		for (const record of recordArray.records) {
			await AddSensorMeasurement(mariadb, station_id, sensorName, record);
			await wire.dispatch("new-record", `${station_id}|${record.name}`);
		}
	}
}, mariadb);
srv.Start();