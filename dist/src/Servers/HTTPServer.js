import https from "https";
import express, { json } from "express";
import { readFileSync } from "fs";
export default class HTTPServer {
    app;
    log;
    server;
    constructor(pPort, pLogFn, pSSLKeyFilePath, pSSLCertFilePath) {
        this.app = express();
        this.log = pLogFn;
        this.app.use(json());
        this.app.use(express.urlencoded({ extended: true }));
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
                this.log(`Server started at ${new Date().toISOString()} on ::${pPort} (HTTPS)`);
            });
        }
        else {
            this.server = this.app.listen(pPort, () => {
                this.log(`Server started at ${new Date().toISOString()} on ::${pPort} (HTTP)`);
            });
        }
    }
}
//# sourceMappingURL=HTTPServer.js.map