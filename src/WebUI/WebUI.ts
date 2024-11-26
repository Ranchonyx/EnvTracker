import WebServer from "./WebServer.js";
import {RegisteredLogger} from "../Logger/Logger.js";
import MariaDBConnector from "../MariaDBConnector/MariaDBConnector.js";
import AuthTokenStore from "./AuthTokenStore.js";
import express from "express";
import {join} from "node:path";
import {cwd} from "node:process";
import {Guard} from "../Util/Guard.js";
import {IncomingMessage} from "node:http";
import {RawData, WebSocket, WebSocketServer} from "ws";
import {Store} from "express-session";


type CRUDResponse<T, U extends number, V extends object | undefined> = {
	status: U;
	data: T;
	extra: V;
};

type WebsocketEventMessage<T, V> = {
	type: V;
	data: T;
};

type WebsocketEvents = "";

export default class WebUI {
	private readonly WebServer: WebServer;
	private readonly api_mdb: MariaDBConnector;
	private readonly tokenStore: AuthTokenStore;

	private readonly log_rest: RegisteredLogger;
	private readonly log_websocket: RegisteredLogger;

	public constructor(pPort: number, pHomePath: string = "/home", pRestLogger: RegisteredLogger, pWebsocketLogger: RegisteredLogger, pWebserverLogger: RegisteredLogger, pMariaDBConnector: MariaDBConnector, pAuthTokenStore: AuthTokenStore, pSessionStore: Store) {
		this.log_rest = pRestLogger;
		this.log_websocket = pWebsocketLogger;
		this.api_mdb = pMariaDBConnector;
		this.tokenStore = pAuthTokenStore;

		this.WebServer = new WebServer(pPort, pWebserverLogger, pMariaDBConnector, pHomePath, this.tokenStore, pSessionStore);
	}

	public async StartWebUI() {
		const app = this.WebServer.application;
		const ws = this.WebServer.websocketServer;

		app.use(express.static(join(cwd(), 'public')));
		this.log_rest(`Statically serving 'public' directory.`);

		await this.StartWebsockets(ws);
		await this.StartJobActionAPI(app);

		/*app.get("/home", async (_req, res) => {
			res.sendFile(join(cwd(), "public", "pages", "home.html"));
		});

		app.get("/stats", async (_req, res) => {
			res.sendFile(join(cwd(), "public", "pages", "stats.html"));
		});
*/
		//Not found handler
		app.use(async (_req, res, _next) => {
			res.status(404).sendFile(join(cwd(), "public", "pages", "404.html"));
		});

		this.log_rest(`WebUI started .`);
	}

	private PublishWebsocketEvent(data: WebsocketEventMessage<any, any>) {
		const ws = this.WebServer.websocketServer;
		ws.clients.forEach(socket => {
			Guard.CastAs<typeof socket & { subscribedTo: Array<WebsocketEvents> | undefined }>(socket);
			if (!socket.subscribedTo)
				return;

			if (!socket.subscribedTo.includes(data.type))
				return;

			socket.send(JSON.stringify(data));
		});
	}

	private async StartJobActionAPI(pApp: express.Express) {
		//Handle starting, stopping and getting a job's status
		pApp.route("/job/:jobName/:action")
			.get(async (req: express.Request, res: express.Response) => {

			});

		this.log_rest(`Set up action handler for "/job/:jobName/:action" .`);
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

	private createAPIResponse<T, U extends number, V extends undefined | object>(status: U, data: T, extra?: Record<keyof V, string>) {
		type cCRUDResponse<TT, UU extends number, VV extends undefined | object> = VV extends object ? CRUDResponse<TT, UU, VV> : Omit<CRUDResponse<TT, UU, VV>, "extra">;

		if (typeof extra !== "object")
			return {
				status: status,
				data: data
			} as cCRUDResponse<T, U, undefined>;

		return {
			status: status,
			data: data,
			extra: extra
		} as CRUDResponse<T, U, typeof extra>;
	}

	private createWebsocketEvent<T, U extends WebsocketEvents>(Data: T, For: U): WebsocketEventMessage<T, U> {
		return {
			type: For,
			data: Data,
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