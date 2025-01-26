import https from "https";
import http from "node:http";
import express, {Express, json} from "express";
import {RegisteredLogger} from "../Logger/Logger.js";
import {readFileSync} from "fs";
import MariaDBConnector from "../MariaDBConnector/MariaDBConnector.js";
import {Guard} from "../Util/Guard.js";
import {randomBytes} from "node:crypto";
import session, {Store} from "express-session"
import AuthTokenStore from "./AuthTokenStore.js";
import ws, {WebSocketServer} from "ws"
import {clearInterval} from "node:timers";
import {crc32} from "node:zlib";
import compression from "compression";

export default class WebServer {
	private readonly app: Express;
	private readonly server: https.Server | http.Server;
	private readonly log: RegisteredLogger;

	private readonly mdb_api: MariaDBConnector;
	private readonly login_page_string = `
	<!DOCTYPE html>
<html lang="de_DE">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,minimum-scale=1">
    <title>Login</title>
    <link rel="stylesheet" href="https://use.fontawesome.com/releases/v5.7.1/css/all.css">
    <style> * {
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, "segoe ui", roboto, oxygen, ubuntu, cantarell, "fira sans", "droid sans", "helvetica neue", Arial, sans-serif;
        font-size: 16px;
    }

    body {
        background-color: #435165;
    }

    .login {
        width: 400px;
        background-color: #fafaf5;
        box-shadow: 0 0 9px 0 rgba(0, 0, 0, 0.3);
        margin: 100px auto;
    }

    .login h1 {
        text-align: center;
        color: #5b6574;
        font-size: 24px;
        padding: 20px 0 20px 0;
        border-bottom: 1px solid #dee0e4;
    }

    .login form {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        padding-top: 20px;
    }

    .login form label {
        display: flex;
        justify-content: center;
        align-items: center;
        width: 50px;
        height: 50px;
        background-color: #1d808f;
        color: #fafaf5;
    }

    .login form input[type="password"], .login form input[type="text"] {
        width: 310px;
        height: 50px;
        border: 1px solid #dee0e4;
        margin-bottom: 20px;
        padding: 0 15px;
    }

    .login form input[type="submit"] {
        width: 100%;
        padding: 15px;
        margin-top: 20px;
        background-color: #1d808f;
        border: 0;
        cursor: pointer;
        font-weight: bold;
        color: #fafaf5;
        transition: background-color 0.2s;
    }

    .login form input[type="submit"]:hover {
        background-color: #2fcae8;
        transition: background-color 0.2s;
    }
    </style>
    <script>
    function sha512(str) {
		return crypto.subtle.digest("SHA-512", new TextEncoder("utf-8").encode(str)).then(buf => {
    		return Array.prototype.map.call(new Uint8Array(buf), x=>(('00'+x.toString(16)).slice(-2))).join('');
 		});
	}
    document.addEventListener("DOMContentLoaded", (ev) => {
    	const loginForm = document.querySelector("form");
        loginForm.addEventListener("submit", async (ev) => {
            ev.preventDefault();
            const fd = new FormData(ev.target);
            const map = Object.fromEntries(fd.entries());
            map["password"] = await sha512(map["password"]);
            
            const response = await fetch("/auth", {
                body: JSON.stringify(map),
                method: "post",
				headers: {
            		'Accept': 'application/json',
            		'Content-Type': 'application/json'
        		},
            });
            
            if(response.redirected)
                window.location.href = response.url;
        })
    })
	</script>
</head>
<body>
<div class="login">
    <h1>EnvTrack - Einloggen</h1>
    <form action="/auth" method="post">
        <label for="username">
            <i class="fas fa-user"></i>
        </label>
        <input type="text" name="username" placeholder="Benutzername" id="username" required>
        <label for="password"> <i class="fas fa-lock"></i> </label> <input type="password" name="password" placeholder="Passwort" id="password" required>
        <input type="submit" value="Login"></form>
</div>
</body>
</html>
	`;
	private readonly homepage: string;
	private readonly wsTokenStore: AuthTokenStore;
	private readonly wsServer: ws.Server;
	private readonly sessionParser: ReturnType<typeof session>;
	private readonly WebsocketHeartbeatInterval: NodeJS.Timeout;

	public constructor(pPort: number, pLogFn: RegisteredLogger, pDbConnector: MariaDBConnector, pHomePath: string, pAuthTokenStore: AuthTokenStore, pSessionStore: Store, pSSLKeyFilePath?: string, pSSLCertFilePath?: string) {
		this.app = express();
		this.log = pLogFn;
		this.mdb_api = pDbConnector;
		this.homepage = pHomePath;
		this.wsTokenStore = pAuthTokenStore;

		this.app.use(compression())
		this.app.use(json({limit: "50mb"}));
		this.app.set("etag", (body: Buffer) => {
			return `R//${crc32(body).toString(16)}//`
		});

		this.sessionParser =
			session({
				secret: Buffer.from([0xCA, 0xFE, 0xBA, 0xBE, ...randomBytes(1020)]).toString("hex"),
				resave: true,
				saveUninitialized: false,
				cookie: {
					maxAge: 900000
				},
				store: pSessionStore
			});

		this.app.use(this.sessionParser);

		this.app.use(express.urlencoded({extended: true}));

		this.app.use(async (req, res, next) => {
			Guard.CastAs<Record<"loggedIn" | "username", any>>(req.session);

			//routen, die kein auth benötigen
			const openRoutes = ["/auth", "/"]
			//Falls die route nicht /auth oder / ist
			if (!openRoutes.includes(req.path)) {
				//Und die session nicht eingeloggt ist, wird nach / redirected

				const authenticatedViaLogin = req.session.loggedIn;

				if (!authenticatedViaLogin)
					return res.redirect("/");
				//Sonst einfach weiter machen ...
				return next();
			}

			//Falls die route, offen ist, weiter machen ...
			return next();
		});

		this.app.get("/", async (_req, res) => {
			res.send(this.login_page_string);
		});

		this.app.post("/auth", async (req, res) => {
			Guard.CastAs<Record<"username" | "password", string>>(req.body);

			const [username, password] = [req.body.username, req.body.password];

			if (username && password) {
				const dbResult = await this.mdb_api.QuerySafe(`SELECT hash FROM credential WHERE hash = (?) AND id = (?)`, [password, username]);
				Guard.AgainstNullish(dbResult);

				if (!(dbResult.length > 0))
					return res.status(403).redirect("/");

				Guard.CastAs<Record<"loggedIn" | "username", any>>(req.session)
				req.session.loggedIn = true;
				req.session.username = username;

				res.cookie("X-WEBSOCKET-ACCESS-TOKEN", this.wsTokenStore.RequestToken({
					id: username,
					password: password
				}, 3.6e+6));

				res.cookie("X-CONNECTION-ID", req.session.id);
				return res.redirect(this.homepage);
			}

			res.status(403).send('Invalid credentials.');
		});


		//If we have a key and cert, enable HTTPS mode, otherwise keep it HTTP
		if (pSSLKeyFilePath && pSSLCertFilePath) {

			this.log(`[SSL] Attempting to configure SSL...`);
			//I can "!" these properties since the class validates its own config on startup
			const key = readFileSync(pSSLKeyFilePath, "utf8");
			const cert = readFileSync(pSSLCertFilePath, "utf8");

			const options: Record<string, any> = {
				key: key,
				cert: cert
			};

			this.server = https.createServer(options, this.app);

			this.server.listen(pPort, () => {
				this.log(`[SSL] Configuration successful...`);
				this.log(`WebUI Server started at ${new Date().toISOString()} on ::${pPort} (HTTPS)`);
			});
		} else {
			this.server = this.app.listen(pPort, () => {
				this.log(`WebUI Server started at ${new Date().toISOString()} on ::${pPort} (HTTP)`);
			});
		}

		this.wsServer = new WebSocketServer({noServer: true});

		this.server.on("upgrade", (request, socket, head) => {
			this.log(`Connection from ${request.socket.remoteAddress}:${request.socket.remotePort} wants to upgrade to websockets.`);

			const goAway = () => {
				this.log(`WebSocket connection from ${request.socket.remoteAddress}:${request.socket.remotePort} was denied.`);
				socket.write(`HTTP/1.1 401 Unauthorized\r\n\r\n`);
				socket.destroy();
			}

			if (!request.headers.cookie) {
				goAway();
				return;
			}

			const cookie = request.headers.cookie.split("; ");
			const cookies: Record<string, string> = cookie.reduce((acc, val) => {
				const [k, v] = val.split("=");
				(acc as Record<typeof k, any>)[k] = v;
				return acc;
			}, {});

			const authenticatedViaBearer = cookies["X-WEBSOCKET-ACCESS-TOKEN"] ? this.wsTokenStore.IsTokenValid(cookies["X-WEBSOCKET-ACCESS-TOKEN"] as string) : false;
			if (!authenticatedViaBearer) {
				goAway();
				return;
			}

			this.log(`WebSocket ${request.socket.remoteAddress}:${request.socket.remotePort} was authenticated.`);

			this.wsServer.handleUpgrade(request, socket, head, (socket) => {
				Guard.CastAs<typeof socket & { isAlive: boolean, socketId: string }>(socket);

				socket.socketId = cookies["X-CONNECTION-ID"];
				socket.isAlive = true;
				socket.on("error", this.log);

				socket.on("message", function (message) {
					Guard.CastAs<typeof socket>(this);
					if (!(message.toString("utf8") === "pong"))
						return;

					this.isAlive = true;
				});

				const _log = this.log.bind(this);
				socket.on("close", function (code, reason) {
					_log(`WebSocket ${request.socket.remoteAddress}:${request.socket.remotePort} has closed the connection.`);
					this.terminate();

				})

				this.wsServer.emit("connection", socket, request);
			});
		});

		this.WebsocketHeartbeatInterval = setInterval(() => {
			for (const client of this.wsServer.clients) {
				Guard.CastAs<typeof client & { isAlive: boolean }>(client);

				if (!client.isAlive) {
					this.log(`Terminating dead WebSocket client.`);
					return client.terminate();
				}

				client.isAlive = false;
				client.send("ping");
			}
		}, 15000);
	}

	private BasicAuthToCredentialPair(BasicAuthString: string): { id: string; password: string } {
		const asString = Buffer.from(BasicAuthString.slice(6), "base64").toString("utf8");
		const lastDot = asString.lastIndexOf(":");

		const id = asString.slice(0, lastDot);
		const pass = asString.slice(lastDot + 1);

		return {id: id, password: pass};
	}

	public Destroy() {
		this.wsTokenStore.Destroy();
		this.server.removeAllListeners();
		this.server.close();

		clearInterval(this.WebsocketHeartbeatInterval);
		for (const client of this.wsServer.clients)
			client.terminate();

		this.wsServer.removeAllListeners();
		this.wsServer.close();
	}

	public get application() {
		return this.app;
	}

	public get websocketServer() {
		return this.wsServer;
	}
}