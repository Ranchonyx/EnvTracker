import MariaDBConnector from "../MariaDBConnector/MariaDBConnector.js";
import {Guard} from "./Guard.js";

type SensorIdent = "hp20x" | "sen55" | "sht45" | "ina3221";
type SensorMapping = Record<SensorIdent, Array<string>>;

type MappedSensorMeasurement = {
	name: string;
	unit: string;
	value: number;
}

type SensorMeasurementRecords = {
	sensorName: SensorIdent;
	records: Array<MappedSensorMeasurement>;
}

type INA3221MeasurementType =
	"Solar Voltage"
	| "Solar Amperage"
	| "System Voltage"
	| "System Amperage"
	| "Battery Voltage"
	| "Battery Amperage";

type SHT45MeasurementType = "Temperature" | "Humidity";

type SEN55MeasurementType =
	"pm1p0"
	| "pm2p5"
	| "pm4p0"
	| "pm10"
	| "Humidity"
	| "Temperature"
	| "Volatile Compounds"
	| "N² Compounds";

type HP20xMeasurementType = "Temperature" | "Pressure" | "Altitude";

export type AllMeasurementType =
	HP20xMeasurementType
	| SEN55MeasurementType
	| SHT45MeasurementType
	| INA3221MeasurementType;

export type AllMeasurementUnit = "°C" | "hPa" | "m" | "µg/m³" | "%" | "scalar" | "V" | "A";

export const AvailableMeasurementTypes: Array<AllMeasurementType> = [
	"pm1p0",
	"pm10",
	"pm2p5",
	"pm4p0",
	"Humidity",
	"Temperature",
	"Pressure",
	"Altitude",
	"N² Compounds",
	"Volatile Compounds",
	"Battery Amperage",
	"Solar Amperage",
	"System Amperage",
	"System Voltage",
	"Battery Voltage",
	"Solar Voltage"
];

function mapMeasurements(name: string, measurements: Array<string>): Array<MappedSensorMeasurement> {
	const unitMapping: SensorMapping = {
		hp20x: ["°C", "hPa", "m"],
		sen55: ["µg/m³", "µg/m³", "µg/m³", "µg/m³", "%", "°C", "scalar", "scalar"],
		sht45: ["°C", "%"],
		ina3221: ["V", "A", "V", "A", "V", "A"]
	}

	const nameMapping: SensorMapping = {
		hp20x: ["Temperature", "Pressure", "Altitude"],
		sen55: ["pm1p0", "pm2p5", "pm4p0", "pm10", "Humidity", "Temperature", "Volatile Compounds", "N² Compounds"],
		sht45: ["Temperature", "Humidity"],
		ina3221: ["Solar Voltage", "Solar Amperage", "System Voltage", "System Amperage", "Battery Voltage", "Battery Amperage"]
	}

	const results: Array<MappedSensorMeasurement> = [];

	for (let i = 0; i < measurements.length; i++) {
		const sensorName = name.toLowerCase() as SensorIdent;

		results.push({
			name: nameMapping[sensorName][i],
			unit: unitMapping[sensorName][i],
			value: parseFloat(measurements[i])
		})
	}

	return results;
}

export function ParseMeasurementString(stationData: string): Array<SensorMeasurementRecords> {
	const splitData = stationData.split(";");

	return splitData.map((sensorRecord) => {
		const [sensorName, measurementString] = sensorRecord.split(":");
		const measurements = measurementString.split(",");
		return {
			sensorName: sensorName as SensorIdent,
			records: mapMeasurements(sensorName, measurements)
		}
	})
}

export function TryParseMeasurementString(stationData: string): Array<SensorMeasurementRecords> | null {
	try {
		return ParseMeasurementString(stationData);
	} catch (ex) {
		return null;
	}
}

export async function GetSensorGuidByNameAndStationId(mdb_api: MariaDBConnector, sensorName: string, stationId: string): Promise<string | null> {
	const response = await mdb_api.Query<Record<"guid", string>>(
		`
		SELECT
			guid
		FROM
			sensor
		WHERE
			station_guid = '${stationId}' AND LOWER(name) = '${sensorName.toLowerCase()}'
		`
	);

	if (!response)
		return null;

	if (response.length === 0)
		return null;

	return response[0].guid;

}

export async function CreateSensorIfNotExists(mdb_api: MariaDBConnector, station_guid: string, name: string) {
	const exists = await mdb_api.Exists("sensor", "name", name);
	if (exists)
		return;

	return mdb_api.Query(
		`INSERT INTO sensor (station_guid, name, status_flags) VALUES ('${station_guid}', '${name}', 0)`
	);
}

export async function AddSensorMeasurement(mdb_api: MariaDBConnector, station_guid: string, sensorName: string, measurement: MappedSensorMeasurement) {
	const sensor_guid = await GetSensorGuidByNameAndStationId(mdb_api, sensorName, station_guid);
	Guard.AgainstNullish(sensor_guid);

	return mdb_api.Query(
		`INSERT INTO measurement (sensor_guid, timestamp, unit, value, name) VALUES ('${sensor_guid}', '${new Date().toISOString()}', '${measurement.unit}', ${measurement.value}, '${measurement.name}')`
	);
}