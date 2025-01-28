import MariaDBConnector from "../MariaDBConnector/MariaDBConnector.js";
import {Guard} from "./Guard.js";
import {execSync} from "node:child_process";

type SensorIdent = "hp20x" | "sen55" | "sht45" | "ina3221";
type SensorMapping = Record<SensorIdent, Array<string>>;

export type MappedSensorMeasurement = {
	name: string;
	unit: string;
	value: number;
}

export type SensorMeasurementRecords = {
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
	"Temperature",
	"Humidity",
	"Pressure",
	"N² Compounds",
	"Volatile Compounds",
	"Altitude",
	"pm1p0",
	"pm10",
	"pm2p5",
	"pm4p0",
	"System Voltage",
	"System Amperage",
	"Solar Voltage",
	"Solar Amperage",
	"Battery Voltage",
	"Battery Amperage"
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

export function GetBuildNumber(): number {
	const gitRevBuffer = execSync("git rev-list --count --all");
	return parseInt(gitRevBuffer.toString().trim(), 10);
}