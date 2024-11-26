import * as mdb from "mariadb";
import { EOL } from "node:os";
import { Guard } from "../Util/Guard.js";
export default class MariaDBConnector {
    static instance;
    pool;
    log;
    static GetInstance(pConfig, pLogger) {
        if (!MariaDBConnector.instance)
            MariaDBConnector.instance = new MariaDBConnector(pConfig, pLogger);
        return MariaDBConnector.instance;
    }
    constructor(pConfig, pLogger) {
        this.pool = mdb.createPool({ ...pConfig, bigIntAsNumber: true });
        this.log = pLogger;
        this.log(`Created MariaDB connection pool with a max size of ${pConfig.connectionLimit ? pConfig.connectionLimit : 10} connections.`);
    }
    async QueryMany(queries) {
        let conn;
        const results = [];
        try {
            conn = await this.pool.getConnection();
            await conn.beginTransaction();
            for (const query of queries)
                results.push(await conn.query(query));
            await conn.commit();
            return results;
        }
        catch (ex) {
            this.log(`Database Connector encountered an error whilst trying to execute`, queries.map(q => `[${q}]`).join(EOL));
            if (ex instanceof Error)
                this.log(JSON.stringify(ex), ex?.stack);
            conn?.rollback();
        }
        finally {
            if (conn !== undefined)
                await conn.release();
        }
        return null;
    }
    async Query(text) {
        let conn;
        try {
            conn = await this.pool.getConnection();
            await conn.beginTransaction();
            const result = await conn.query(text);
            await conn.commit();
            return result;
        }
        catch (ex) {
            this.log(`Database Connector encountered an error whilst trying to execute`, text);
            if (ex instanceof Error)
                this.log(JSON.stringify(ex), ex?.stack);
            conn?.rollback();
        }
        finally {
            if (conn !== undefined)
                await conn.release();
        }
        return null;
    }
    async QuerySafe(text, params) {
        let conn;
        try {
            conn = await this.pool.getConnection();
            await conn.beginTransaction();
            const result = await conn.query(text, params);
            await conn.commit();
            return result;
        }
        catch (ex) {
            this.log(`Database Connector encountered an error whilst trying to execute`, text);
            if (ex instanceof Error)
                this.log(JSON.stringify(ex), ex?.stack);
            conn?.rollback();
        }
        finally {
            if (conn !== undefined)
                await conn.release();
        }
        return null;
    }
    async Exists(table, key, value) {
        const _key = `SELECT EXISTS( SELECT ${key} FROM ${table} WHERE ${key} = '${value}')`;
        const resp = await this.Query(`${_key};`);
        Guard.AgainstNullish(resp);
        const first = resp[0];
        return first[_key.slice(7)] === 1;
    }
    async Destroy() {
        await this.pool.end();
    }
}
//# sourceMappingURL=MariaDBConnector.js.map