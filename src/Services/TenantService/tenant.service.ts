import express from "express";
import {Guard} from "../../Util/Guard.js";
import {QueryTenantIdResponse, QueryTenantNameResponse} from "../../WebUI/DBResponses.js";
import {RegisteredLogger} from "../../Logger/Logger.js";
import MariaDBConnector from "../../MariaDBConnector/MariaDBConnector.js";

export default class Service {
	private static instance: Service | undefined;

	private constructor(private log: RegisteredLogger, private mariadb: MariaDBConnector) {
	}

	public static GetInstance(log?: RegisteredLogger, mariadb?: MariaDBConnector): Service {
		if (!Service.instance && log && mariadb) {
			log("Init")

			return (Service.instance = new Service(log, mariadb))
		}

		return Service.instance!;
	}

	public async GetTenantId(req: express.Request): Promise<string | null> {
		Guard.CastAs<Record<"loggedIn" | "username", any>>(req.session);
		const username = req.session.username;

		const queryTenantIdResponse = await this.mariadb.Query<QueryTenantIdResponse>(
			`select
					c.guid as TenantId
				from
					credential c
				where
					c.id = '${username}'
			`);

		Guard.AgainstNullish(queryTenantIdResponse);

		this.log(`Queried tenant id for request => ${queryTenantIdResponse[0]?.TenantId || null}`);
		if (queryTenantIdResponse.length === 0)
			return null;

		return queryTenantIdResponse[0].TenantId;
	}

	public async GetTenantName(tenant_id: string): Promise<string> {
		const queryTenantNameResponse = await this.mariadb.Query<QueryTenantNameResponse>(
			`select
					c.id as TenantName
				from
					credential c
				where
					c.guid = '${tenant_id}'
			`);

		Guard.AgainstNullish(queryTenantNameResponse);

		this.log(`Queried tenant name for id '${tenant_id}' => ${queryTenantNameResponse[0]?.TenantName || null}`);
		Guard.AgainstNullish(queryTenantNameResponse[0].TenantName);

		return queryTenantNameResponse[0].TenantName;
	}

	public async RequestorIsTenant(req: express.Request): Promise<boolean> {
		Guard.CastAs<Record<"loggedIn" | "username", any>>(req.session);

		const tenant_id = req.params.tenant_id;

		const queryTenantResponse = await this.mariadb.Query<QueryTenantNameResponse>(
			`select
					c.id as TenantName
				from
					credential c
				where
					c.guid = '${tenant_id}'
			`);

		if (!queryTenantResponse || queryTenantResponse.length === 0)
			return false;

		const result = queryTenantResponse.at(0);
		Guard.AgainstNullish(result);

		const response = result.TenantName === req.session.username;
		this.log(`result.TenantName ${result.TenantName} === tenant_id ${req.session.username} ? ${response}`)

		return response;
	}
}