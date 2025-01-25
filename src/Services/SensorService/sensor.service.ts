import {RegisteredLogger} from "../../Logger/Logger.js";
import {QuerySensorResponse, QuerySensorsResponse} from "../../WebUI/DBResponses.js";
import {Guard} from "../../Util/Guard.js";
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
}