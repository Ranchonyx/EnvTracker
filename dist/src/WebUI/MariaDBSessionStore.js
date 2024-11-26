import { Store } from "express-session";
import { Guard } from "../Util/Guard.js";
export default class MariaDBSessionStore extends Store {
    api_mdb;
    static instance;
    hasInitialisedTables = false;
    static async Instantiate(pMariaDBConnector) {
        if (!MariaDBSessionStore.instance)
            MariaDBSessionStore.instance = new MariaDBSessionStore(pMariaDBConnector);
        await MariaDBSessionStore.instance.InitTables();
        return MariaDBSessionStore.instance;
    }
    constructor(pMariaDBConnector) {
        super();
        this.api_mdb = pMariaDBConnector;
    }
    async InitTables() {
        if (this.hasInitialisedTables)
            return;
        await this.api_mdb.QueryMany([
            "CREATE TABLE IF NOT EXISTS session_store (sid VARCHAR(255) PRIMARY KEY NOT NULL, data TEXT);"
        ]);
        this.clear();
    }
    //Required as per spec
    destroy(sid, callback) {
        this.api_mdb.QuerySafe(`DELETE FROM session_store WHERE sid = (?);`, [
            sid
        ]).then((_) => {
            if (callback)
                return callback(null);
        });
    }
    //Required as per spec
    get(sid, callback) {
        this.api_mdb.QuerySafe(`SELECT data FROM session_store WHERE sid = (?);`, [
            sid
        ]).then((result) => {
            if (!result)
                return callback(new Error("ENOENT", { cause: "Exception during database query." }));
            if (result.length === 0)
                return callback(new Error("ENOENT", { cause: "No such session." }));
            return callback(null, JSON.parse(result[0].data));
        });
    }
    all(callback) {
        this.api_mdb.Query("SELECT * FROM session_store").then((result) => {
            if (!result)
                return callback(new Error("ENOENT", { cause: "Exception during database query." }));
            return callback(null, result.reduce((acc, v, _) => acc[v.sid] = JSON.parse(v.data), {}));
        });
    }
    //Required as per spec
    set(sid, session, callback) {
        //INSERT INTO sync_stats_day (date, crm_queries) VALUES(CURRENT_DATE(), crm_queries + 1) ON DUPLICATE KEY UPDATE date = CURRENT_DATE(), crm_queries = crm_queries + 1;
        const data = JSON.stringify(session);
        if (callback) {
            if (!sid || !session)
                return callback(new Error("ENOPARAM", { cause: "Parameters not complete." }));
        }
        this.api_mdb.Query(`INSERT INTO session_store (sid, data) VALUES('${sid}', '${data}') ON DUPLICATE KEY update data = '${data}';`).then((result) => {
            if (callback) {
                if (!result)
                    return callback(new Error("ENOENT", { cause: "Exception during database query." }));
                if (result.length === 0)
                    return callback(new Error("ENOENT", { cause: "No such session." }));
                return callback(null);
            }
        });
    }
    clear(callback) {
        this.api_mdb.Query("DELETE FROM session_store;").then((result) => {
            if (callback) {
                if (!result)
                    return callback(new Error("EDBERROR", { cause: "Exception during database query." }));
                return callback(null);
            }
        });
    }
    length(callback) {
        this.api_mdb.Query("SELECT COUNT(*) as count from session_store;").then((result) => {
            if (!result)
                return callback(new Error("EDBERROR", { cause: "Exception during database query." }));
            if (result.length === 0)
                return callback(new Error("EDBERROR", { cause: "Exception during database query." }));
            Guard.AgainstNullish(result[0]);
            return callback(null, result[0].count || 0);
        });
    }
    //Required as per spec, NOP here
    touch(sid, session, callback) {
        Guard.AgainstNullish(super.touch);
        super.touch(sid, session, callback);
    }
}
//# sourceMappingURL=MariaDBSessionStore.js.map