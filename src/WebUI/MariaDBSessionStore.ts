import session, {SessionData, Store} from "express-session"
import MariaDBConnector from "../MariaDBConnector/MariaDBConnector.js";
import {Guard} from "../Util/Guard.js";

export default class MariaDBSessionStore extends Store {
	private api_mdb: MariaDBConnector;

	private static instance: MariaDBSessionStore | undefined;
	private hasInitialisedTables: boolean = false;

	public static async Instantiate(pMariaDBConnector: MariaDBConnector) {
		if (!MariaDBSessionStore.instance)
			MariaDBSessionStore.instance = new MariaDBSessionStore(pMariaDBConnector);

		await MariaDBSessionStore.instance.InitTables();

		return MariaDBSessionStore.instance;
	}

	private constructor(pMariaDBConnector: MariaDBConnector) {
		super();

		this.api_mdb = pMariaDBConnector;
	}

	protected async InitTables() {
		if(this.hasInitialisedTables)
			return;

		await this.api_mdb.QueryMany([
			"CREATE TABLE IF NOT EXISTS session_store (sid VARCHAR(255) PRIMARY KEY NOT NULL, data TEXT);"
		]);

		this.clear();
	}

	//Required as per spec
	public destroy(sid: string, callback?: (err?: any) => void): void {
		this.api_mdb.QuerySafe(
			`DELETE FROM session_store WHERE sid = (?);`,
			[
				sid
			]
		).then((_) => {
			if (callback)
				return callback(null);
		});
	}

	//Required as per spec
	public get(sid: string, callback: (err: any, session?: (SessionData | null)) => void): void {
		this.api_mdb.QuerySafe(
			`SELECT data FROM session_store WHERE sid = (?);`,
			[
				sid
			]
		).then((result) => {
			if (!result)
				return callback(new Error("ENOENT", {cause: "Exception during database query."}));

			if (result.length === 0)
				return callback(new Error("ENOENT", {cause: "No such session."}));

			return callback(null, JSON.parse(result[0].data));
		});
	}

	public all(callback: (err: any, obj?: (session.SessionData[] | {
		[p: string]: session.SessionData
	} | null)) => void) {
		this.api_mdb.Query(
			"SELECT * FROM session_store"
		).then((result) => {
			if (!result)
				return callback(new Error("ENOENT", {cause: "Exception during database query."}));

			return callback(null, result.reduce((acc, v, _) => acc[v.sid] = JSON.parse(v.data), {}));
		});
	}

	//Required as per spec
	public set(sid: string, session: SessionData, callback?: (err?: any) => void): void {
		//INSERT INTO sync_stats_day (date, crm_queries) VALUES(CURRENT_DATE(), crm_queries + 1) ON DUPLICATE KEY UPDATE date = CURRENT_DATE(), crm_queries = crm_queries + 1;
		const data = JSON.stringify(session);

		if (callback) {
			if (!sid || !session)
				return callback(new Error("ENOPARAM", {cause: "Parameters not complete."}));
		}

		this.api_mdb.Query(
			`INSERT INTO session_store (sid, data) VALUES('${sid}', '${data}') ON DUPLICATE KEY update data = '${data}';`
		).then((result) => {
			if (callback) {
				if (!result)
					return callback(new Error("ENOENT", {cause: "Exception during database query."}));

				if (result.length === 0)
					return callback(new Error("ENOENT", {cause: "No such session."}));

				return callback(null);
			}
		});
	}

	public clear(callback?: (err?: any) => void) {
		this.api_mdb.Query(
			"DELETE FROM session_store;"
		).then((result) => {
			if (callback) {
				if (!result)
					return callback(new Error("EDBERROR", {cause: "Exception during database query."}));

				return callback(null);
			}
		});
	}

	public length(callback: (err: any, length?: number) => void) {
		this.api_mdb.Query(
			"SELECT COUNT(*) as count from session_store;"
		).then((result) => {
			if (!result)
				return callback(new Error("EDBERROR", {cause: "Exception during database query."}));

			if (result.length === 0)
				return callback(new Error("EDBERROR", {cause: "Exception during database query."}));

			Guard.AgainstNullish(result[0]);

			return callback(null, result[0].count || 0);
		});
	}

	//Required as per spec, NOP here
	public touch(sid: string, session: session.SessionData, callback?: () => void) {
		Guard.AgainstNullish(super.touch);
		super.touch(sid, session, callback);
	}
}