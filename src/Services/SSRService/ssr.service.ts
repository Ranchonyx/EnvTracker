import {Application} from "express";
import {RegisteredLogger} from "../../Logger/Logger.js";

export default class Service {
	private static instance: Service | undefined;

	private constructor(private app: Application, private log: RegisteredLogger) {
	}

	public static GetInstance(app?: Application, log?: RegisteredLogger): Service {
		if (!Service.instance && app && log) {
			log("Init");

			return (Service.instance = new Service(app, log))
		}

		return Service.instance!;
	}

	/*
	* Ein EJS-Template mit einem Datensatz an Variablen serverseitig rendern
	* */
	public async Render<Vars extends Record<string, any> = Record<string, any>>(pTemplate: string, pOpts: Vars): Promise<string> {
		const perf1 = performance.now();
		return new Promise<string>((resolve, reject) => {
			this.app.render(pTemplate, pOpts, (err, html) => {
				if (err) {
					console.error(err);
					reject(err);
				}

				this.log(`Rendered template "${pTemplate}" with in ${(performance.now() - perf1).toFixed(2)} ms`);

				resolve(html);
			});
		})
	}
}