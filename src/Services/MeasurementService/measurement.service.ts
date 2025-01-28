import {RegisteredLogger} from "../../Logger/Logger.js";
import {AllMeasurementType, AllMeasurementUnit, AvailableMeasurementTypes} from "../../Util/MeasurementUtil.js";
import {Measurement} from "../../WebUI/DBResponses.js";
import MariaDBConnector from "../../MariaDBConnector/MariaDBConnector.js";

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

	private ToMDBDate(isoString: string) {
		return isoString.replace(/[TZ]/gm, " ").trim();
	}

	private Convert<T extends AllMeasurementType, U extends AllMeasurementUnit>(pMeasurements: Array<Measurement<T, U>>): Array<Measurement<T, U>> {
		return pMeasurements.map(m => {
			return {
				timestamp: m.timestamp,
				unit: m.unit,
				name: m.name,
				value: parseFloat("" + m.value)
			};
		})
	}

	public async QueryMeasurementsOfType<T extends AllMeasurementType, U extends AllMeasurementUnit>(station_guid: string, rows: number | "all", ...types: Array<T>): Promise<Array<Measurement<T, U>>> {
		const constraint = types
			.map(type => `'${type}'`)
			.join(", ");

		const selectClause = rows === "all" ? "" : `where rn = ${rows}`;

		const response = await this.mariadb.Query<Measurement<T, U>>(
			`
				WITH LatestData AS
				(
					SELECT m.unit, m.value, m.name, m.timestamp, ROW_NUMBER()
						OVER (PARTITION BY m.name ORDER BY timestamp DESC) AS rn
					FROM
						measurement m
					LEFT JOIN
						sensor s
							ON s.station_guid = '${station_guid}'
					WHERE
						m.name in (${constraint}) and s.station_guid = '${station_guid}'
				)
				select * from LatestData ${selectClause};
			`
		);

		this.log(`Queried measurements of type ["${types.join(",")}"] for station ${station_guid}`);

		if (!response || response.length === 0)
			return [];

		return this.Convert(response);
	}

	public async QueryMeasurementsOfTypeInDateRange<T extends AllMeasurementType, U extends AllMeasurementUnit>(station_guid: string, pType: AllMeasurementType | "all", ISOStart?: string, ISOEnd?: string, groupedBy?: "HOUR" | "MINUTE" | "HOUR_AND_MINUTE"): Promise<Array<Measurement<T, U>>> {
		const whereClauseOrEmptyString = ISOStart && ISOEnd
			? `where CAST(timestamp as datetime) between '${this.ToMDBDate(ISOStart)}' and '${this.ToMDBDate(ISOEnd)}'`
			: "";

		let groupByClause = "";
		switch (groupedBy) {
			case "HOUR":
				groupByClause = "HOUR(CAST(timestamp as datetime)) + 1";
				break;
			case "MINUTE":
				groupByClause = "LPAD(MINUTE(CAST(timestamp AS DATETIME)), 2, '0')";
				break;
			case "HOUR_AND_MINUTE":
			default:
				groupByClause = "CONCAT(HOUR(CAST(timestamp as datetime)) + 1, ':', LPAD(MINUTE(CAST(timestamp AS DATETIME)), 2, '0'))";
		}

		const typeClause = pType === "all" ? "" : `m.name = '${pType}' and`;

		const response = await this.mariadb.Query<Measurement<T, U>>(
			`
				WITH LatestData AS
				(
					SELECT m.unit, m.value, m.name, m.timestamp
					FROM
						measurement m
					LEFT JOIN
						sensor s
					ON
						s.station_guid = '${station_guid}'
					WHERE
						${typeClause} s.station_guid = '${station_guid}'
				)
				SELECT
					name, unit, value, ${groupByClause} AS timestamp
				FROM
					LatestData ${whereClauseOrEmptyString}
				GROUP BY ${groupByClause}, name, unit
			`
		);

		/*
		*
				WITH LatestData AS
				(
					SELECT m.unit, m.value, m.name, m.timestamp
					FROM
						measurement m
					LEFT JOIN
						sensor s
					ON
						s.station_guid = 'e7ce4d5e-b6f9-11ef-b475-d0ad089b010b'
					WHERE
						m.name = 'Temperature' and s.station_guid = 'e7ce4d5e-b6f9-11ef-b475-d0ad089b010b'
				)
				SELECT
					name, unit, AVG(value) as value, HOUR(CAST(timestamp as datetime)) as timestamp
				FROM
					LatestData where CAST(timestamp as datetime) between '2025-01-23 23:00:00.000' and '2025-01-24 22:59:59.999'
				GROUP BY HOUR(CAST(timestamp as datetime)), name, unit
		* */

		this.log(`Queried measurements of type "${pType}" in date range ${ISOStart} - ${ISOEnd} for station ${station_guid}`);
		if (!response || response.length === 0)
			return [];

		return this.Convert(response);
	}

	public async QueryLatestMeasurementsOfType<T extends AllMeasurementType, U extends AllMeasurementUnit>(station_guid: string, ...types: Array<T>): Promise<Array<Measurement<T, U>>> {
		this.log(`Queried latest measurements of type [${types.join(",")}] for ${station_guid}`);

		return this.QueryMeasurementsOfType<T, U>(station_guid, 1, ...types);
	}

	public async QueryStatusForStation(station_guid: string) {
		this.log(`Queried brief measurement staus for station ${station_guid}`);

		return this.QueryLatestMeasurementsOfType(station_guid, "Temperature", "Humidity", "Pressure", "Battery Voltage");
	}

	public async QueryAvailableMeasurementTypes(): Promise<Array<AllMeasurementType>> {
		return AvailableMeasurementTypes;
	}
}