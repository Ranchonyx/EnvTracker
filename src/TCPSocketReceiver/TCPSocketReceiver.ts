import {createServer, Server, Socket} from "node:net"
import TCPIncomingTransmission from "./TCPIncomingTransmission.js";
import EventEmitter from "node:events";

/*
* STATION   =>  [HELO <STATION_ID>]     => SERVER
* SERVER    =>  [OK]                    => STATION
* STATION   =>  [SIZE <DATA_LENGTH>]    => SERVER
* SERVER    =>  [OK]                    => STATION
* STATION   =>  [DATE <RAW_DATA>]       => SERVER
* SERVER    =>  [BYBY]                  => STATION
* STATION   =>  [OK]                    => SERVER
* */

export interface SocketReceiverEvents {
	"transmission_finished": (data: Buffer) => void;
}

export interface ISocketReceiver {
	on<U extends keyof SocketReceiverEvents>(event: U, listener: SocketReceiverEvents[U]): this;

	emit<U extends keyof SocketReceiverEvents>(event: U, ...args: Parameters<SocketReceiverEvents[U]>): boolean;
}

export default class SocketReceiver extends EventEmitter implements ISocketReceiver {
	private readonly port: number;
	private server: Server | null = null;

	private transmissions: Array<TCPIncomingTransmission> = [];

	public constructor(pPort: number) {
		super();

		this.port = pPort;
	}

	public Start() {
		console.log(`Starting socket receiver on port ${this.port}`);
		this.server =
			createServer((socket) => {
				const transmission = new TCPIncomingTransmission(socket);
				transmission.on("data_available", (data: Buffer) => {
					console.log("TRANSMISSION_FINISHED", data);
					this.emit("transmission_finished", data);
				});
				this.transmissions.push(transmission);
			})

		this.server.listen(this.port);
		console.log("Listening?", this.server.listening)
	}
}