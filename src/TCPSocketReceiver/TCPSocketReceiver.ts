import {createServer, Server} from "node:net"
import TalkTransmission from "../TalkProtocol/TalkTransmission.js";
import EventEmitter from "node:events";
import TalkProtocolTransmission from "../TalkProtocol/TalkTransmission.js";
import {RegisteredLogger} from "../Logger/Logger.js";
import MariaDBConnector from "../MariaDBConnector/MariaDBConnector.js";

/*
* STATION   =>  [HELO <STATION_ID>]     => SERVER
* SERVER    =>  [OK]                    => STATION
* STATION   =>  [SIZE <DATA_LENGTH>]    => SERVER
* SERVER    =>  [OK]                    => STATION
* STATION   =>  [DATE <RAW_DATA>]       => SERVER
* SERVER    =>  [FINI]                  => STATION
* STATION   =>  [OK]                    => SERVER
* */

export interface SocketReceiverEvents {
	"transmission_finished": (data: Buffer) => void;
}

export interface ISocketReceiver {
	on<U extends keyof SocketReceiverEvents>(event: U, listener: SocketReceiverEvents[U]): this;

	emit<U extends keyof SocketReceiverEvents>(event: U, ...args: Parameters<SocketReceiverEvents[U]>): boolean;
}

type MeasurementCallbackFunction = (station_id: string, data: Buffer) => void;

export default class SocketReceiver extends EventEmitter implements ISocketReceiver {
	private readonly port: number;
	private server: Server | null = null;
	private __nextId = 0;
	private readonly log: RegisteredLogger;

	private readonly transmissions: Array<TalkProtocolTransmission> = [];

	public constructor(pPort: number, pLogger: RegisteredLogger, private onMeasurement: MeasurementCallbackFunction, private mdb_api: MariaDBConnector) {
		super();

		this.log = pLogger;
		this.port = pPort;
	}

	public Start() {
		this.server =
			createServer((socket) => {
				const tId = this.__nextId++;
				const transmission = new TalkTransmission(socket, tId, this.mdb_api);
				transmission.Attach();

				transmission.on("data_available", (station_id: string, data: Buffer) => {
					const myIdx = this.transmissions.findIndex(tr => tr.tId === tId);
					const oldTransmission = this.transmissions.splice(myIdx, 1);

					if (!oldTransmission[0]!.clientIsIdentified)
						return;

					this.onMeasurement(station_id, data);
				});

				this.transmissions.push(transmission);
			})

		this.server.listen(this.port, () => {
			this.log(`SocketReceiver listening on ${this.port}`);
		});
	}
}