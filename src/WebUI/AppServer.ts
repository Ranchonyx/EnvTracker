import WebServer from "./WebServer.js";
import Logger, {RegisteredLogger} from "../Logger/Logger.js";
import MariaDBConnector from "../MariaDBConnector/MariaDBConnector.js";
import AuthTokenStore from "./AuthTokenStore.js";
import express from "express";
import {join} from "node:path";
import {cwd} from "node:process";
import {Guard} from "../Util/Guard.js";
import {IncomingMessage} from "node:http";
import {RawData, WebSocket, WebSocketServer} from "ws";
import {Store} from "express-session";

import {Channel} from "../EventBus/EventBus.js";

import HomeRoute from "../Routes/home.route.js";
import StationsRoute from "../Routes/station.route.js";
import VisualizationRoute from "../Routes/visualization.route.js";

import ChartService from "../Services/ChartService/chart.service.js";
import SSRService from "../Services/SSRService/ssr.service.js";
import SensorService from "../Services/SensorService/sensor.service.js";
import StationService from "../Services/StationService/station.service.js";
import MeasurementService from "../Services/MeasurementService/measurement.service.js";
import TenantService from "../Services/TenantService/tenant.service.js";
import MeasurementRoute from "../Routes/measurement.route.js";
import ChartRoute from "../Routes/chart.route.js";
import PredictionServiceRegistry from "../Services/PredictionService/prediction.service.js";
import PredictionRoute from "../Routes/prediction.route.js";
import {AllMeasurementType} from "../Util/MeasurementUtil.js";

type WebsocketEventMessage<T, V> = {
	type: V;
	data: T;
};

type WebsocketEvents = string;

export default class AppServer {
	private readonly WebServer: WebServer;
	private readonly mariadb: MariaDBConnector;
	private readonly tokenStore: AuthTokenStore;

	private readonly log_rest: RegisteredLogger;
	private readonly log_websocket: RegisteredLogger;

	public constructor(pPort: number, pHomePath: string = "/home", pRestLogger: RegisteredLogger, pWebsocketLogger: RegisteredLogger, pWebserverLogger: RegisteredLogger, pMariaDBConnector: MariaDBConnector, pAuthTokenStore: AuthTokenStore, pSessionStore: Store, private channel: Channel, private predictionConfig: {
		modelDirectory: string
	}) {
		this.log_rest = pRestLogger;
		this.log_websocket = pWebsocketLogger;
		this.mariadb = pMariaDBConnector;
		this.tokenStore = pAuthTokenStore;

		this.WebServer = new WebServer(pPort, pWebserverLogger, pMariaDBConnector, pHomePath, this.tokenStore, pSessionStore);
	}

	public async InitialiseServices() {
		const logMgr = Logger.GetInstance();

		const prefixes = [
			"SERVICE/CHART",
			"SERVICE/MEASUREMENT",
			"SERVICE/SENSOR",
			"SERVICE/SSR",
			"SERVICE/STATION",
			"SERVICE/TENANT",
			"SERVICE/PREDICTION"
		] as const;

		type ToUnion<T extends readonly any[]> = T[number];

		//Create all required service loggers...
		const loggers = logMgr.createMany<ToUnion<typeof prefixes>>(prefixes);

		//Initialise all required services
		ChartService.GetInstance(loggers.get("SERVICE/CHART"));
		SSRService.GetInstance(this.WebServer.application, loggers.get("SERVICE/SSR"));
		SensorService.GetInstance(loggers.get("SERVICE/SENSOR"), this.mariadb);
		StationService.GetInstance(loggers.get("SERVICE/STATION"), this.mariadb);
		MeasurementService.GetInstance(loggers.get("SERVICE/MEASUREMENT"), this.mariadb);
		TenantService.GetInstance(loggers.get("SERVICE/TENANT"), this.mariadb);
		const initialisedPredRegistry = await PredictionServiceRegistry.GetInstance(loggers.get("SERVICE/PREDICTION"), this.mariadb, `file://${this.predictionConfig.modelDirectory}`);
		await initialisedPredRegistry.InitialiseAllPredictionServices();

	}

	public async Start() {
		const app = this.WebServer.application;
		const ws = this.WebServer.websocketServer;

		//Get and statically serve the /public/ path so pages can load resources
		const publicPath = join(cwd(), "public");
		app.use(express.static(publicPath));

		//Configure express to use EJS and template engine and viewDirectory as the directory to SSR from
		const viewDirectory = join(publicPath, "templates");
		app.set("view engine", "ejs");
		app.set("views", viewDirectory);

		//Start the websocket auth and pub/sub server
		await this.StartWebsockets(ws);

		//Mount all routes...
		app.use("/stations", StationsRoute);
		app.use("/home", HomeRoute);
		app.use("/viz", VisualizationRoute);
		app.use("/measurement", MeasurementRoute);
		app.use("/chart", ChartRoute);
		app.use("/prediction", PredictionRoute);
		this.log_rest(`All routers mounted.`);

		//If the requested route matches nothing, display a lovely 404 page
		app.use(async (_req, res) => {
			res.status(404).sendFile(join(cwd(), "public", "pages", "404.html"));
		});

		//Register listener for the channel to notify subscribed websockets of new data for their observing station
		this.channel.addListener<string>(`new-record`, async (station_id_type: string) => {
			const [station_id, type] = station_id_type.split("|");
			const wsEvtMessage = this.createWebsocketEvent(`new-record-${station_id}`, type);
			this.PublishWebsocketEvent(wsEvtMessage);
		})
	}

	private createWebsocketEvent<T, U extends WebsocketEvents>(For: U, Data: T): WebsocketEventMessage<T, U> {
		return {
			type: For,
			data: Data,
		}
	}

	private PublishWebsocketEvent(data: WebsocketEventMessage<any, any>) {
		const ws = this.WebServer.websocketServer;
		/*
				this.log_websocket(`Broadcasting ${JSON.stringify(data)} to ${ws.clients.size} websocket clients.`)
		*/
		ws.clients.forEach(socket => {
			Guard.CastAs<typeof socket & { subscribedTo: Array<WebsocketEvents> | undefined }>(socket);
			if (!socket.subscribedTo)
				return;

			if (!socket.subscribedTo.includes(data.type))
				return;

			socket.send(JSON.stringify(data));
		});
	}

	private async StartWebsockets(pWs: WebSocketServer) {
		pWs.on("connection", async (socket, req) => {
			socket.on("message", async (messageData) => {
				if (messageData.toString("utf8") === "pong")
					return;

				await this.HandleWebsocketMessage(socket, req, messageData);
			});
		});

		this.log_websocket(`Set up WebSocket Pub/Sub server .`);
	}

	private async HandleWebsocketMessage(socket: WebSocket, _req: IncomingMessage, messageData: RawData) {
		Guard.CastAs<typeof socket & { socketId: string }>(socket);

		const message = messageData.toString("utf8");
		const params = message.split("#");

		const ctrl_command = params.splice(0, 1)[0];

		this.log_websocket(`Handling WebSocket control command: "${ctrl_command}" (${params.length > 0 ? params.join(", ") : "<None>"}) from ${socket.socketId || "<Unknown socket ID>"}`);
		switch (ctrl_command) {
			case "subscribe":
				if (params.length === 0) {
					this.log_websocket(`Too few parameters for control command "${ctrl_command}" .`)
					break;
				}

				Guard.CastAs<WebsocketEvents>(params[0]);
				this.SubscribeWebsocket(socket, params[0]);
				break;
			case "unsubscribe":
				if (params.length === 0) {
					this.log_websocket(`Too few parameters for control command "${ctrl_command}" .`)
					break;
				}

				Guard.CastAs<WebsocketEvents>(params[0]);
				this.UnsubscribeWebsocket(socket, params[0]);
				break;
			default:
				this.log_rest(`Received unknown WebSocket control command "${ctrl_command}" .`);
				break;
		}
	}

	private SubscribeWebsocket(pSocket: WebSocket, pEvent: WebsocketEvents) {
		Guard.CastAs<typeof pSocket & { subscribedTo: Array<WebsocketEvents> }>(pSocket);

		if (!pSocket.subscribedTo)
			pSocket.subscribedTo = [];

		if (!pSocket.subscribedTo.includes(pEvent))
			pSocket.subscribedTo.push(pEvent);
	}

	private UnsubscribeWebsocket(pSocket: WebSocket, pEvent: WebsocketEvents) {
		Guard.CastAs<typeof pSocket & { subscribedTo: Array<WebsocketEvents> }>(pSocket);

		if (!pSocket.subscribedTo)
			return;

		if (!pSocket.subscribedTo.includes(pEvent))
			return;

		const eventIndex = pSocket.subscribedTo.findIndex(v => v === pEvent);
		pSocket.subscribedTo.splice(eventIndex, 1);
	}
}