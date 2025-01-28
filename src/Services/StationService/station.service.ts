import {RegisteredLogger} from "../../Logger/Logger.js";
import {
	QueryStationMetaResponse,
	QueryStationResponse
} from "../../WebUI/DBResponses.js";
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

	/*
	* Alle im System verfügbaren Stations-IDs abrufen
	* */
	public async QueryAllStationIds(): Promise<Array<string>> {
		const queriedStationIds = await this.mariadb.Query<{station_id: string}>(
			`select
						guid as station_id
					from
						station
			`
		);

		Guard.AgainstNullish(queriedStationIds);
		this.log("Queried all station ids");

		return queriedStationIds.map(r => r.station_id);
	}

	/*
	* Alle Stationen für einen Mandanten abrufen
	* */
	public async QueryStationsForTenant(tenant_id: string): Promise<Array<QueryStationMetaResponse>> {
		const queriedStationData = await this.mariadb.Query<QueryStationMetaResponse>(
			`select
						s.name as StationName, s.location as StationLocation, s.description as StationDescription, s.battery as StationBattery, s.guid as StationGuid
					from
						station0 s
					where
						s.credential_guid = '${tenant_id}'
			`);

		Guard.AgainstNullish(queriedStationData);
		this.log(`Queried stations for ${tenant_id}`);

		return queriedStationData;
	}

	/*
	* Metadaten und Messwert-Briefing über eine Station abrufen
	* */
	public async QueryStation(station_guid: string): Promise<QueryStationResponse> {
		const queryStationsResponse = await this.mariadb.Query<QueryStationResponse>(
			`select
						s.name as StationName, s.location as StationLocation, s.description as StationDescription, s.battery as StationBattery, s.guid as StationGuid, s.serial_number as StationSerialNumber, s.solar_panel as StationSolarPanel, s.status_flags as StationStatusFlags
					from
						station0 s
					where
						s.guid = '${station_guid}'
			`);

		Guard.AgainstNullish(queryStationsResponse);
		this.log(`Queried station data for ${station_guid}`);

		return queryStationsResponse[0]!;
	}
}