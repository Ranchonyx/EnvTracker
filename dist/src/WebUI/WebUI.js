import WebServer from "./WebServer.js";
import express from "express";
import { join } from "node:path";
import { cwd } from "node:process";
import { Guard } from "../Util/Guard.js";
export default class WebUI {
    WebServer;
    api_mdb;
    tokenStore;
    log_rest;
    log_websocket;
    constructor(pPort, pHomePath = "/home", pRestLogger, pWebsocketLogger, pWebserverLogger, pMariaDBConnector, pAuthTokenStore, pSessionStore) {
        this.log_rest = pRestLogger;
        this.log_websocket = pWebsocketLogger;
        this.api_mdb = pMariaDBConnector;
        this.tokenStore = pAuthTokenStore;
        this.WebServer = new WebServer(pPort, pWebserverLogger, pMariaDBConnector, pHomePath, this.tokenStore, pSessionStore);
    }
    async StartWebUI() {
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
    async StartJobActionAPI(pApp) {
        //Handle starting, stopping and getting a job's status
        pApp.route("/job/:jobName/:action")
            .get(async (req, res) => {
        });
        this.log_rest(`Set up action handler for "/job/:jobName/:action" .`);
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
    createAPIResponse(status, data, extra) {
        if (typeof extra !== "object")
            return {
                status: status,
                data: data
            };
        return {
            status: status,
            data: data,
            extra: extra
        };
    }
    createWebsocketEvent(Data, For) {
        return {
            type: For,
            data: Data,
        };
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
}
//# sourceMappingURL=WebUI.js.map