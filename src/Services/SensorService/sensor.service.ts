import {RegisteredLogger} from "../../Logger/Logger.js";
import {QuerySensorResponse, QuerySensorsResponse} from "../../WebUI/DBResponses.js";
import {Guard} from "../../Util/Guard.js";
import MariaDBConnector from "../../MariaDBConnector/MariaDBConnector.js";
import {MappedSensorMeasurement} from "../../Util/MeasurementUtil.js";

export default class Service {
	private static instance: Service | undefined;

	private constructor(private log: RegisteredLogger, private mariadb: MariaDBConnector) {
	}

	public static GetInstance(log?: RegisteredLogger, mariadb?: MariaDBConnector): Service {
		if (!Service.instance && log && mariadb) {
			log("Init");

			return (Service.instance = new Service(log, mariadb))
		}

		return Service.instance!;
	}

	/*
	* Alle Sensoren für eine gegebene Station abrufen
	* @Deprecated
	* */
	public async QuerySensorsForStation(station_guid: string): Promise<QuerySensorsResponse> {
		const querySensorsResponse = await this.mariadb.Query<QuerySensorResponse>(
			`select
					s.guid as SensorGuid, s.name as SensorName, s.status_flags as SensorFlags
				from
					sensor s
				where
					s.station_guid = '${station_guid}'
			`);

		this.log(`Queried sensors for ${station_guid}`);
		Guard.AgainstNullish(querySensorsResponse);

		return querySensorsResponse;
	}

	/*
	* Sensor-ID anhand von Stations-ID und Sensornamen abfragen
	* */
	public async GetSensorGuidByNameAndStationId(sensorName: string, stationId: string): Promise<string | null> {
		const response = await this.mariadb.Query<Record<"guid", string>>(
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
	/*
	* Einen Sensor neu erzeugen, wenn er noch nicht existiert und mit der gegebenen Station verknüpfen
	* */
	public async CreateSensorIfNotExists(station_guid: string, name: string): Promise<void> {
		const exists = await this.mariadb.Exists("sensor", "name", name);
		if (exists)
			return;

		return this.mariadb.Query(
			`INSERT INTO sensor (station_guid, name, status_flags) VALUES ('${station_guid}', '${name}', 0)`
		) as unknown as void;
	}

	/*
	* Einen neuen Messwert-Datensatz für einen gegebenen Sensor einer gegebenen Station hinzufügen
	* */
	public async AddSensorMeasurement(station_guid: string, sensorName: string, measurement: MappedSensorMeasurement): Promise<void> {
		const sensor_guid = await this.GetSensorGuidByNameAndStationId(sensorName, station_guid);
		Guard.AgainstNullish(sensor_guid);

		const insertTimestamp = new Date().toISOString();
		let {value, unit, name} = measurement;

		if(name === "Altitude")
			value = 44.801;

		return this.mariadb.Query(
			`INSERT INTO measurement (sensor_guid, timestamp, unit, value, name) VALUES ('${sensor_guid}', '${insertTimestamp}', '${unit}', ${value}, '${name}')`
		) as unknown as void;
	}
}