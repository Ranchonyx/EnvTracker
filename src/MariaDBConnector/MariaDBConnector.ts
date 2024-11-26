import * as mdb from "mariadb"
import {MariaDBConnectorConfigSpec} from "./types/MariaDBConnector.js";
import {EOL} from "node:os";
import {Guard} from "../Util/Guard.js";
import {RegisteredLogger} from "../Logger/Logger.js";

export default class MariaDBConnector {
	private static instance: MariaDBConnector | undefined;
	private readonly pool: mdb.Pool;
	private readonly log: RegisteredLogger;

	public static GetInstance(pConfig: MariaDBConnectorConfigSpec, pLogger: RegisteredLogger): MariaDBConnector {
		if (!MariaDBConnector.instance)
			MariaDBConnector.instance = new MariaDBConnector(pConfig, pLogger);
		return MariaDBConnector.instance;
	}

	private constructor(pConfig: MariaDBConnectorConfigSpec, pLogger: RegisteredLogger) {
		this.pool = mdb.createPool({...pConfig, bigIntAsNumber: true});
		this.log = pLogger;

		this.log(`Created MariaDB connection pool with a max size of ${pConfig.connectionLimit ? pConfig.connectionLimit : 10} connections.`);
	}

	public async QueryMany<ResultSetType = Record<string, any>>(queries: Array<string>): Promise<Array<ResultSetType> | null> {
		let conn: mdb.PoolConnection | undefined;
		const results: Array<ResultSetType> = [];

		try {
			conn = await this.pool.getConnection();

			await conn.beginTransaction();
			for (const query of queries)
				results.push(await conn.query(query));

			await conn.commit();

			return results;
		} catch (ex) {
			this.log(`Database Connector encountered an error whilst trying to execute`, queries.map(q => `[${q}]`).join(EOL));
			if (ex instanceof Error)
				this.log(JSON.stringify(ex), ex?.stack);

			conn?.rollback();
		} finally {
			if (conn !== undefined)
				await conn.release();
		}

		return null;
	}

	public async Query<ResultSetType = Record<string, any>>(text: string): Promise<Array<ResultSetType> | null> {
		let conn: mdb.PoolConnection | undefined;
		try {
			conn = await this.pool.getConnection();

			await conn.beginTransaction();
			const result = await conn.query(text);
			await conn.commit();

			return result;
		} catch (ex) {
			this.log(`Database Connector encountered an error whilst trying to execute`, text);
			if (ex instanceof Error)
				this.log(JSON.stringify(ex), ex?.stack);

			conn?.rollback();
		} finally {
			if (conn !== undefined)
				await conn.release();
		}

		return null;
	}

	public async QuerySafe<ResultSetType = Record<string, any>>(text: string, params: Array<string>): Promise<Array<ResultSetType> | null> {
		let conn: mdb.PoolConnection | undefined;
		try {
			conn = await this.pool.getConnection();

			await conn.beginTransaction();
			const result = await conn.query(text, params);
			await conn.commit();

			return result;
		} catch (ex) {
			this.log(`Database Connector encountered an error whilst trying to execute`, text);
			if (ex instanceof Error)
				this.log(JSON.stringify(ex), ex?.stack);

			conn?.rollback();
		} finally {
			if (conn !== undefined)
				await conn.release();
		}

		return null;
	}

	public async Exists(table: string, key: string, value: string): Promise<boolean> {
		const _key = `SELECT EXISTS( SELECT ${key} FROM ${table} WHERE ${key} = '${value}')`;
		const resp = await this.Query(`${_key};`);
		Guard.AgainstNullish(resp);

		const first = resp[0];
		return first[_key.slice(7)] === 1;
	}

	public async Destroy() {
		await this.pool.end();
	}
}