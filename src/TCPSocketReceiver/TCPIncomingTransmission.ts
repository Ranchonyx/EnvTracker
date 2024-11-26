import EventEmitter from "node:events";
import {Socket} from "node:net";

export interface IncomingTransmissionEvents {
	"data_available": (data: Buffer) => void;
}

export interface ITCPIncomingTransmission {
	on<U extends keyof IncomingTransmissionEvents>(event: U, listener: IncomingTransmissionEvents[U]): this;

	emit<U extends keyof IncomingTransmissionEvents>(event: U, ...args: Parameters<IncomingTransmissionEvents[U]>): boolean;
}

/*
* STATION   =>  [HELO <STATION_ID>]     => SERVER
* SERVER    =>  [ACK]                   => STATION
* STATION   =>  [SIZE <DATA_LENGTH>]    => SERVER
* SERVER    =>  [ACK]                   => STATION
* STATION   =>  [DATA <RAW_DATA>]       => SERVER
* SERVER    =>  [FINI]                  => STATION
* */

export default class TCPIncomingTransmission extends EventEmitter implements ITCPIncomingTransmission {
	private socket: Socket;
	private MESSAGE_BUFFER_SIZE = 4096;
	private data: Buffer = Buffer.alloc(this.MESSAGE_BUFFER_SIZE);

	public constructor(pSocket: Socket) {
		super();

		this.socket = pSocket;

		this.socket
			.on("data", (data) => {
				const packet = data.toString("utf8");
				const [command, rest] = packet.split(" ");

				if(!["HELO", "SIZE", "DATA", "FINI", ].includes(command))

				console.log(`INCOMING TCP TRANSMISSION`);
				console.log(command, rest);

				this.socket.write(data);
				switch (command) {
					case "HELO":
						if (rest === "DEMO_STATION")
							this.socket.writable && this.socket.write("ACK");
						else
							this.socket.writable && this.socket.write("NAK");
						break;
					case "SIZE":
						if (parseInt(rest) > (this.MESSAGE_BUFFER_SIZE - this.socket.bytesRead))
							this.socket.writable && this.socket.write("ACK");
						else
							this.socket.writable && this.socket.write("NAK")
						break;
					case "DATA":
						data.copy(this.data, 0, 4, data.length);
						this.socket.writable && this.socket.write("ACK");
						break;
					case "FINI":
						this.socket.end();
						break;
					default:
				}
				if (data.length > this.MESSAGE_BUFFER_SIZE)
					throw new Error(`Incoming data length would exceed MESSAGE_BUFFER_SIZE (${this.MESSAGE_BUFFER_SIZE}) !`);
				this.data = Buffer.concat([this.data, data]);
			})
			.on("end", () => {
				this.emit("data_available", this.data);
			});
	}
}