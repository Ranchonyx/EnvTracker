import https from "https";
import http from "node:http";
import {RegisteredLogger} from "../Logger/Logger.js";
import express, {Express, json} from "express";
import {readFileSync} from "fs";

export default abstract class HTTPServer {
	protected readonly app: Express;
	protected readonly log: RegisteredLogger;
	private readonly server: https.Server | http.Server;

	protected constructor(pPort: number, pLogFn: RegisteredLogger, pSSLKeyFilePath?: string, pSSLCertFilePath?: string) {
		this.app = express();
		this.log = pLogFn;
		this.app.use(json());

		this.app.use(express.urlencoded({extended: true}));

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
				this.log(`Server started at ${new Date().toISOString()} on ::${pPort} (HTTPS)`);
			});
		} else {
			this.server = this.app.listen(pPort, () => {
				this.log(`Server started at ${new Date().toISOString()} on ::${pPort} (HTTP)`);
			});
		}
	}

	public abstract Start(): Promise<void>;
}