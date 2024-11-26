import https from "https";
import express, { json } from "express";
import { readFileSync } from "fs";
import { Guard } from "../Util/Guard.js";
import { createHash, randomBytes } from "node:crypto";
import session from "express-session";
import { WebSocketServer } from "ws";
import { clearInterval } from "node:timers";
function sha512(str) {
    return createHash("sha512").update(str).digest("hex");
}
export default class WebServer {
    app;
    server;
    log;
    mdb_api;
    login_page_string = `<!DOCTYPE html> <html lang="en_GB"> <head> <meta charset="utf-8"> <meta name="viewport" content="width=device-width,minimum-scale=1"> <title>Login</title> <link rel="stylesheet" href="https://use.fontawesome.com/releases/v5.7.1/css/all.css"> <style> * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "segoe ui", roboto, oxygen, ubuntu, cantarell, "fira sans", "droid sans", "helvetica neue", Arial, sans-serif; font-size: 16px; } body { background-color: #435165; } .login { width: 400px; background-color: #ffffff; box-shadow: 0 0 9px 0 rgba(0, 0, 0, 0.3); margin: 100px auto; } .login h1 { text-align: center; color: #5b6574; font-size: 24px; padding: 20px 0 20px 0; border-bottom: 1px solid #dee0e4; } .login form { display: flex; flex-wrap: wrap; justify-content: center; padding-top: 20px; } .login form label { display: flex; justify-content: center; align-items: center; width: 50px; height: 50px; background-color: #3274d6; color: #ffffff; } .login form input[type="password"], .login form input[type="text"] { width: 310px; height: 50px; border: 1px solid #dee0e4; margin-bottom: 20px; padding: 0 15px; } .login form input[type="submit"] { width: 100%; padding: 15px; margin-top: 20px; background-color: #3274d6; border: 0; cursor: pointer; font-weight: bold; color: #ffffff; transition: background-color 0.2s; } .login form input[type="submit"]:hover { background-color: #2868c7; transition: background-color 0.2s; } </style> </head> <body> <div class="login"> <h1>Login</h1> <form action="/auth" method="post"> <label for="username"> <i class="fas fa-user"></i> </label> <input type="text" name="username" placeholder="Benutzername" id="username" required> <label for="password"> <i class="fas fa-lock"></i> </label> <input type="password" name="password" placeholder="Passwort" id="password" required> <input type="submit" value="Login"> </form> </div> </body> </html>`;
    homepage;
    wsTokenStore;
    wsServer;
    sessionParser;
    WebsocketHeartbeatInterval;
    constructor(pPort, pLogFn, pDbConnector, pHomePath, pAuthTokenStore, pSessionStore, pSSLKeyFilePath, pSSLCertFilePath) {
        this.app = express();
        this.log = pLogFn;
        this.mdb_api = pDbConnector;
        this.homepage = pHomePath;
        this.wsTokenStore = pAuthTokenStore;
        this.app.use(json());
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
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(async (req, res, next) => {
            Guard.CastAs(req.session);
            //routen, die kein auth benötigen
            const openRoutes = ["/auth", "/"];
            //Falls die route nicht /auth oder / ist
            if (!openRoutes.includes(req.path)) {
                //Und die session nicht eingeloggt ist, wird nach / redirected
                const authenticatedViaLogin = req.session.loggedIn;
                const authenticatedViaBasic = req.headers.authorization ? await this.verifyBasicAuth(req.headers.authorization) : false;
                const isLoggedIn = authenticatedViaLogin || authenticatedViaBasic;
                if (!isLoggedIn)
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
            Guard.CastAs(req.body);
            const [username, password] = [req.body.username, req.body.password];
            const passwordHash = sha512(password);
            if (username && password && passwordHash) {
                const dbResult = await this.mdb_api.QuerySafe(`SELECT hash FROM credentials WHERE hash = (?) AND id = (?)`, [passwordHash, username]);
                Guard.AgainstNullish(dbResult);
                if (!(dbResult.length > 0))
                    return res.status(403).redirect("/");
                Guard.CastAs(req.session);
                req.session.loggedIn = true;
                req.session.username = username;
                res.cookie("X-WEBSOCKET-ACCESS-TOKEN", this.wsTokenStore.RequestToken({
                    id: username,
                    password: passwordHash
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
            const options = {
                key: key,
                cert: cert
            };
            this.server = https.createServer(options, this.app);
            this.server.listen(pPort, () => {
                this.log(`[SSL] Configuration successful...`);
                this.log(`WebUI Server started at ${new Date().toISOString()} on ::${pPort} (HTTPS)`);
            });
        }
        else {
            this.server = this.app.listen(pPort, () => {
                this.log(`WebUI Server started at ${new Date().toISOString()} on ::${pPort} (HTTP)`);
            });
        }
        this.wsServer = new WebSocketServer({ noServer: true });
        this.server.on("upgrade", (request, socket, head) => {
            this.log(`Connection from ${request.socket.remoteAddress}:${request.socket.remotePort} wants to upgrade to websockets.`);
            const goAway = () => {
                this.log(`WebSocket connection from ${request.socket.remoteAddress}:${request.socket.remotePort} was denied.`);
                socket.write(`HTTP/1.1 401 Unauthorized\r\n\r\n`);
                socket.destroy();
            };
            if (!request.headers.cookie) {
                goAway();
                return;
            }
            const cookie = request.headers.cookie.split("; ");
            const cookies = cookie.reduce((acc, val) => {
                const [k, v] = val.split("=");
                acc[k] = v;
                return acc;
            }, {});
            const authenticatedViaBearer = cookies["X-WEBSOCKET-ACCESS-TOKEN"] ? this.wsTokenStore.IsTokenValid(cookies["X-WEBSOCKET-ACCESS-TOKEN"]) : false;
            if (!authenticatedViaBearer) {
                goAway();
                return;
            }
            this.log(`WebSocket ${request.socket.remoteAddress}:${request.socket.remotePort} was authenticated.`);
            this.wsServer.handleUpgrade(request, socket, head, (socket) => {
                Guard.CastAs(socket);
                socket.socketId = cookies["X-CONNECTION-ID"];
                socket.isAlive = true;
                socket.on("error", this.log);
                socket.on("message", function (message) {
                    Guard.CastAs(this);
                    if (!(message.toString("utf8") === "pong"))
                        return;
                    this.isAlive = true;
                });
                this.wsServer.emit("connection", socket, request);
            });
        });
        this.WebsocketHeartbeatInterval = setInterval(() => {
            for (const client of this.wsServer.clients) {
                Guard.CastAs(client);
                if (!client.isAlive) {
                    this.log(`Terminating dead WebSocket client.`);
                    return client.terminate();
                }
                client.isAlive = false;
                client.send("ping");
            }
        }, 15000);
    }
    BasicAuthToCredentialPair(BasicAuthString) {
        const asString = Buffer.from(BasicAuthString.slice(6), "base64").toString("utf8");
        const lastDot = asString.lastIndexOf(":");
        const id = asString.slice(0, lastDot);
        const pass = asString.slice(lastDot + 1);
        return { id: id, password: pass };
    }
    async verifyBasicAuth(BasicAuthString) {
        const { id, password } = this.BasicAuthToCredentialPair(BasicAuthString);
        const queryResult = await this.mdb_api.Query(`SELECT hash FROM credentials WHERE Id = '${id}'`);
        if (!queryResult || queryResult.length <= 0)
            return false;
        const db_hash = queryResult[0].hash.trim();
        const pw_hash = sha512(password);
        return db_hash === pw_hash;
    }
    Destroy() {
        this.wsTokenStore.Destroy();
        this.server.removeAllListeners();
        this.server.close();
        clearInterval(this.WebsocketHeartbeatInterval);
        for (const client of this.wsServer.clients)
            client.terminate();
        this.wsServer.removeAllListeners();
        this.wsServer.close();
    }
    get application() {
        return this.app;
    }
    get websocketServer() {
        return this.wsServer;
    }
}
//# sourceMappingURL=WebServer.js.map