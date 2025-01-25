import WebServer from "./WebServer.js";
import express from "express";
import { join } from "node:path";
import { cwd } from "node:process";
import { Guard } from "../Util/Guard.js";
import { AvailableMeasurementTypes } from "../Util/MeasurementUtil.js";
import { OmitMany } from "../Util/Omit.js";
import { CreateChart, CreateDataset } from "../ChartDataAdapter/ChartDataAdapter.js";
export default class WebUI {
    channel;
    WebServer;
    mariadb;
    tokenStore;
    log_rest;
    log_websocket;
    constructor(pPort, pHomePath = "/home", pRestLogger, pWebsocketLogger, pWebserverLogger, pMariaDBConnector, pAuthTokenStore, pSessionStore, channel) {
        this.channel = channel;
        this.log_rest = pRestLogger;
        this.log_websocket = pWebsocketLogger;
        this.mariadb = pMariaDBConnector;
        this.tokenStore = pAuthTokenStore;
        this.WebServer = new WebServer(pPort, pWebserverLogger, pMariaDBConnector, pHomePath, this.tokenStore, pSessionStore);
    }
    async StartWebUI() {
        const app = this.WebServer.application;
        const ws = this.WebServer.websocketServer;
        const publicPath = join(cwd(), "public");
        function generatePastelColor() {
            // Generate a pastel color using HSL
            const hue = Math.floor(Math.random() * 360); // Random hue
            const saturation = 70 + Math.random() * 20; // 70-90% saturation
            const lightness = 85 + Math.random() * 10; // 85-95% lightness
            return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        }
        app.use(express.static(publicPath));
        this.log_rest(`Statically serving 'public' directory .`);
        app.set("view engine", "ejs");
        const viewDirectory = join(publicPath, "templates");
        app.set("views", viewDirectory);
        await this.StartWebsockets(ws);
        await this.StartStationAPI(app);
        app.get("/home", async (req, res) => {
            const tenantId = await this.GetTenantId(req);
            Guard.AgainstNullish(tenantId);
            const stationsMeta = await this.QueryStations(tenantId);
            const meta = stationsMeta.map(e => Object({ ImageColour: generatePastelColor(), ...e }));
            const rendered = await this.SSR("pages/home", { stations: meta.reverse() });
            res.send(rendered);
        });
        app.get("/viz/:station_id", async (req, res) => {
            const rendered = await this.SSR("pages/viz", {});
            res.send(rendered);
        });
        /*app.get("/stats", async (_req, res) => {
            res.sendFile(join(cwd(), "public", "pages", "stats.html"));
        });
        */
        //Not found handler
        app.use(async (_req, res) => {
            res.status(404).sendFile(join(cwd(), "public", "pages", "404.html"));
        });
        //Register listener for the channel to notify subscribed websockets of new data for their observing station
        this.channel.addListener(`new-record`, async (station_id) => {
            console.log("aaaa")
            const wsEvtMessage = this.createWebsocketEvent(`new-records-${station_id}`, null);
            this.PublishWebsocketEvent(wsEvtMessage);
        });
        this.log_rest(`WebUI started .`);
    }
    async StartStationAPI(pApp) {
        pApp.get(`/stations/:station_id`, async (req, res) => {
            const querySingleStationResponse = await this.QueryStation(req.params.station_id);
            res.send(querySingleStationResponse);
        });
        pApp.get("/stations/:station_id/measurements/types", async (req, res) => {
            res.send(await this.QueryMeasurementTypes());
        });
        pApp.get("/stations/:station_id/measurements/:type/:iso_start?/:iso_end?", async (req, res) => {
            const { station_id, type, iso_start, iso_end } = req.params;
            if (!AvailableMeasurementTypes.includes(type) && type !== "latest" && type !== "all" && type !== "today") {
                res.status(400).send("No such measurement type available.");
                return;
            }
            switch (type) {
                case "latest":
                    const queryLatestResponse = await this.QueryStatusForStation(station_id);
                    res.send(OmitMany(queryLatestResponse, "rn"));
                    break;
                case "all":
                    const allResult = await this.QueryMeasurementsOfTypeInDateRange(station_id, type);
                    res.send(allResult);
                    break;
                default:
                    const rangeResult = await this.QueryMeasurementsOfTypeInDateRange(station_id, type, iso_start, iso_end);
                    res.send(rangeResult);
                    break;
            }
        });
        pApp.post("/stations/:station_id/chart", async (req, res) => {
            const measurementData = req.body;
            if (!Array.isArray(measurementData) || measurementData.length === 0) {
                res.sendStatus(400);
                return;
            }
            const unit = measurementData[0].unit;
            const label = measurementData[0].name;
            const dataset = CreateDataset(label, measurementData.map(e => e.value));
            const chartData = CreateChart(measurementData.map(e => e.timestamp), [dataset], label, unit);
            res.send(chartData);
        });
        /*pApp.get("/templates/:tenant_id/:station_id/large_pane", async (req: express.Request, res: express.Response) => {
            const tenant_id = req.params.tenant_id;

            console.log(req.session)
            const canLoad = await this.RequestorIsTenant(req);
            if (!canLoad) {
                res.sendStatus(401);
                return;
            }

            const rendered = await this.RenderTemplate("ssr/station_large_pane", result);
            console.log(rendered);
            res.send(rendered);
        });*/
        this.log_rest(`Set up action handler for "/ssr/:tenant_id/:station_id/large_pane" .`);
    }
    async QueryStations(tenant_id) {
        const queriedStationData = await this.mariadb.Query(`select
						s.name as StationName, s.location as StationLocation, s.description as StationDescription, s.battery as StationBattery, s.guid as StationGuid
					from
						station0 s
					where
						s.credential_guid = '${tenant_id}'
			`);
        Guard.AgainstNullish(queriedStationData);
        return queriedStationData;
    }
    async QueryStation(station_guid) {
        const queryStationsResponse = await this.mariadb.Query(`select
						s.name as StationName, s.location as StationLocation, s.description as StationDescription, s.battery as StationBattery, s.guid as StationGuid, s.serial_number as StationSerialNumber, s.solar_panel as StationSolarPanel, s.status_flags as StationStatusFlags
					from
						station0 s
					where
						s.guid = '${station_guid}'
			`);
        Guard.AgainstNullish(queryStationsResponse);
        return queryStationsResponse[0];
    }
    async QuerySensorsForStation(station_guid) {
        const querySensorsResponse = await this.mariadb.Query(`select
					s.guid as SensorGuid, s.name as SensorName, s.status_flags as SensorFlags
				from
					sensor s
				where
					s.station_guid = '${station_guid}'
			`);
        Guard.AgainstNullish(querySensorsResponse);
        return querySensorsResponse;
    }
    async QueryMeasurementTypes() {
        return [...AvailableMeasurementTypes, "all"];
    }
    async QueryMeasurementsOfType(station_guid, rows, ...types) {
        const constraint = types
            .map(type => `'${type}'`)
            .join(", ");
        const selectClause = rows === "all" ? "" : `where rn = ${rows}`;
        const response = await this.mariadb.Query(`
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
			`);
        if (!response || response.length === 0)
            return [];
        return response;
    }
    async QueryLatestMeasurementsOfType(station_guid, ...types) {
        return this.QueryMeasurementsOfType(station_guid, 1, ...types);
    }
    async QueryStatusForStation(station_guid) {
        return this.QueryLatestMeasurementsOfType(station_guid, "Temperature", "Humidity", "Pressure", "Solar Voltage");
    }
    async QueryMeasurementsOfTypeInDateRange(station_guid, pType, ISOStart, ISOEnd) {
        const whereClauseOrEmptyString = ISOStart && ISOEnd
            ? `where CAST(timestamp as datetime) between DATE_ADD('${ISOStart.replace(/T|Z/gm, " ").trim()}', INTERVAL -1 SECOND) and DATE_ADD('${ISOEnd.replace(/T|Z/gm, " ").trim()}', INTERVAL 1 SECOND)`
            : "";
        const typeQuery = pType === "all" ? "" : `m.name = '${pType}' and`;
        const response = await this.mariadb.Query(`
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
						${typeQuery} s.station_guid = '${station_guid}'
				)
				select * from LatestData ${whereClauseOrEmptyString};
			`);
        if (!response || response.length === 0)
            return [];
        return response;
    }
    /*
        private async QueryMeasurementsForSensor<T extends AllMeasurementType>(sensor_guid: string, ...types: Array<T>): Promise<Array<Record<T, string | number>>> {
            const selectFmt = types
                .map(type => `'${type}'`)
                .join(", ");

            const request = await this.mariadb.Query(
                `select
                        m.unit as Unit, m.value as Value, m.name as Name
                    from
                        measurement m
                    where sensor_guid = '${sensor_guid}' and m.name in (${selectFmt})
                    `
            );

            return request;
        }*/
    createWebsocketEvent(For, Data) {
        return {
            type: For,
            data: Data,
        };
    }
    PublishWebsocketEvent(data) {
        const ws = this.WebServer.websocketServer;
        ws.clients.forEach(socket => {
            Guard.CastAs(socket);
            if (!socket.subscribedTo)
                return;
            if (!socket.subscribedTo.includes(data.type))
                return;
            socket.send(JSON.stringify(data));
        });
    }
    async StartWebsockets(pWs) {
        pWs.on("connection", async (socket, req) => {
            socket.on("message", async (messageData) => {
                if (messageData.toString("utf8") === "pong")
                    return;
                await this.HandleWebsocketMessage(socket, req, messageData);
            });
        });
        this.log_websocket(`Set up WebSocket Pub/Sub server .`);
    }
    async HandleWebsocketMessage(socket, _req, messageData) {
        Guard.CastAs(socket);
        const message = messageData.toString("utf8");
        const params = message.split("#");
        const ctrl_command = params.splice(0, 1)[0];
        this.log_websocket(`Handling WebSocket control command: "${ctrl_command}" (${params.length > 0 ? params.join(", ") : "<None>"}) from ${socket.socketId || "<Unknown socket ID>"}`);
        switch (ctrl_command) {
            case "subscribe":
                if (params.length === 0) {
                    this.log_websocket(`Too few parameters for control command "${ctrl_command}" .`);
                    break;
                }
                Guard.CastAs(params[0]);
                this.SubscribeWebsocket(socket, params[0]);
                break;
            case "unsubscribe":
                if (params.length === 0) {
                    this.log_websocket(`Too few parameters for control command "${ctrl_command}" .`);
                    break;
                }
                Guard.CastAs(params[0]);
                this.UnsubscribeWebsocket(socket, params[0]);
                break;
            default:
                this.log_rest(`Received unknown WebSocket control command "${ctrl_command}" .`);
                break;
        }
    }
    SubscribeWebsocket(pSocket, pEvent) {
        Guard.CastAs(pSocket);
        if (!pSocket.subscribedTo)
            pSocket.subscribedTo = [];
        if (!pSocket.subscribedTo.includes(pEvent))
            pSocket.subscribedTo.push(pEvent);
    }
    UnsubscribeWebsocket(pSocket, pEvent) {
        Guard.CastAs(pSocket);
        if (!pSocket.subscribedTo)
            return;
        if (!pSocket.subscribedTo.includes(pEvent))
            return;
        const eventIndex = pSocket.subscribedTo.findIndex(v => v === pEvent);
        pSocket.subscribedTo.splice(eventIndex, 1);
    }
    async SSR(pTemplate, pOpts /*, res: express.Response*/) {
        const perf1 = performance.now();
        return new Promise((resolve, reject) => {
            this.WebServer.application.render(pTemplate, pOpts, (err, html) => {
                if (err) {
                    console.error(err);
                    reject(err);
                }
                this.log_rest(`Rendered template "${pTemplate}" with in ${(performance.now() - perf1).toFixed(2)} ms`);
                resolve(html);
            });
        });
    }
    async RequestorIsTenant(req) {
        Guard.CastAs(req.session);
        const tenant_id = req.params.tenant_id;
        const queryTenantResponse = await this.mariadb.Query(`select
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
        console.log(`result.TenantName ${result.TenantName} === tenant_id ${req.session.username} ? ${response}`);
        return response;
    }
    async GetTenantId(req) {
        Guard.CastAs(req.session);
        const username = req.session.username;
        const queryTenantIdResponse = await this.mariadb.Query(`select
					c.guid as TenantId
				from
					credential c
				where
					c.id = '${username}'
			`);
        Guard.AgainstNullish(queryTenantIdResponse);
        if (queryTenantIdResponse.length === 0)
            return null;
        return queryTenantIdResponse[0].TenantId;
    }
}
//# sourceMappingURL=WebUI.js.map