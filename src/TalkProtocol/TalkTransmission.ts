import EventEmitter from "node:events";
import {Socket} from "node:net";
import {ProtocolAction, ProtocolStatemachine} from "./ProtocolStateMachine.js";
import MariaDBConnector from "../MariaDBConnector/MariaDBConnector.js";

export interface ITalkTransmissionEvents {
	"data_available": (id: number, data: Buffer) => void;
}

export interface ITalkTransmission {
	on<U extends keyof ITalkTransmissionEvents>(event: U, listener: ITalkTransmissionEvents[U]): this;

	emit<U extends keyof ITalkTransmissionEvents>(event: U, ...args: Parameters<ITalkTransmissionEvents[U]>): boolean;
}

/*
* STATION   =>  [HELO <STATION_ID>]     => SERVER
* SERVER    =>  [ACK]                   => STATION
* STATION   =>  [SIZE <DATA_LENGTH>]    => SERVER
* SERVER    =>  [ACK]                   => STATION
* STATION   =>  [DATA <RAW_DATA>]       => SERVER
* SERVER    =>  [ACK]                   => STATION
* STATION   =>  [FINI]                  => STATION
* */

export type TalkCommand = "HELO" | "SIZE" | "DATA" | "FINI";

class TalkDataBuffer {
	private readonly __buffer: Buffer;
	private pointer: number = 0;

	public constructor(size: number) {
		this.__buffer = Buffer.allocUnsafe(size);
	}

	public canWrite(requestedSize: number): boolean {
		const sizeIsPositive = requestedSize >= 1;
		const delta = this.pointer + requestedSize;

		return sizeIsPositive && (delta <= this.__buffer.length);
	}

	public write(data: Buffer, length: number) {
		if (!this.canWrite(length))
			throw new Error("Unable to write past buffer limits!");

		data.copy(this.__buffer, this.pointer, 0, length);

		this.pointer += length;
	}

	public get underlyingBuffer(): Buffer {
		return this.__buffer;
	}

	public get writtenData(): Buffer {
		return this.__buffer.subarray(0, this.pointer);
	}
}


type ParsedTransmissionInfo = {
	command: TalkCommand;
	param: string;
	param_length: number;
};

export default class TalkTransmission extends EventEmitter implements ITalkTransmission {
	private readonly socket: Socket;
	private BUFFER_SZ: number = 4096;

	public clientIsIdentified: boolean = false;

	private buffer: TalkDataBuffer = new TalkDataBuffer(this.BUFFER_SZ);

	private Protocol: ProtocolStatemachine = new ProtocolStatemachine();

	//Initialise to "unknown" state
	private requestedSize: number = -1;

	private readonly id: number;
	private station_id: string;

	public constructor(pSocket: Socket, pId: number, private mdb_api: MariaDBConnector) {
		super();

		this.socket = pSocket;
		this.id = pId;
		this.station_id = "";
	}

	//#region Basic Socket actions
	private Finish() {
		this.socket.end("FINI\n", () => {
			this.socket.destroy();

			this.emit("data_available", this.station_id, this.buffer.writtenData.subarray(0, -2));
		})
	}

	private write(data: Buffer | string): boolean {
		return this.socket.writable && this.socket.write(data);
	}

	private ACK() {
		return this.write("ACK\n");
	}

	private NAK() {
		return this.write("NAK\n");
	}

	private async HandleHELO(param: string) {
		const shouldAuth = await this.mdb_api.Exists("station", "guid", param);

		if(shouldAuth)
			this.station_id = param;

		return shouldAuth;
	}

	private GuardEndpoint() {
		if (!this.clientIsIdentified) {
			console.warn(`Terminating connection with unauthenticated client.`);
			this.Finish();
		}
	}

	//#endregion

	private ParseTransmissionInfo(data: Buffer): ParsedTransmissionInfo {
		const packet = data.toString("utf8").slice(0, -1);
		const [command, rest] = packet.split(" ");
		const length = (rest || []).length;

		return {
			command: command as TalkCommand,
			param: rest,
			param_length: length
		}
	}

	private async HandleProtocol(pTransmissionInfo: ParsedTransmissionInfo) {
		const {command, param, param_length} = pTransmissionInfo;

		const protocol = this.Protocol;

		switch (command) {
			case "HELO":
				protocol.handleAction(ProtocolAction.ReceiveHelo);

				this.clientIsIdentified = await this.HandleHELO(param);

				if (!this.clientIsIdentified) {
					console.warn("Client failed to authenticate.");
					this.GuardEndpoint();
					return;
				}

				protocol.handleAction(ProtocolAction.SendAck);
				////console.log("Okay, client authenticated.");
				break;
			case "SIZE":
				//Guard endpoint against unauthenticated clients
				this.GuardEndpoint();

				protocol.handleAction(ProtocolAction.ReceiveSize);
				const wantedSize = parseInt(param);

				if (!this.buffer.canWrite(wantedSize)) {
					//console.log(`Unable to write ${wantedSize} bytes.`);
					protocol.handleAction(ProtocolAction.SendNak);
					break;
				}

				this.requestedSize = wantedSize;

				protocol.handleAction(ProtocolAction.SendAck);
				//console.log(`Okay, there's enough space for ${wantedSize} bytes!`);

				break;
			case "DATA":
				//Guard endpoint against unauthenticated clients
				this.GuardEndpoint();
				protocol.handleAction(ProtocolAction.ReceiveData);

				if (this.requestedSize !== param_length) {
					//console.log(`Bad, the supplied data length of ${param_length} is not equal to the previously requested length of ${this.requestedSize}!`);
					protocol.handleAction(ProtocolAction.SendNak);

					this.requestedSize = -1;
					break;
				}

				this.buffer.write(Buffer.from(param, "utf8"), param_length);

				//Reset to "unknown" state
				this.requestedSize = -1;

				protocol.handleAction(ProtocolAction.SendAck);
				//console.log(`Okay, I wrote your data "${param}" into my buffer!`);
				break;
			case "FINI":
				//Guard endpoint against unauthenticated clients
				this.GuardEndpoint();

				protocol.handleAction(ProtocolAction.ReceiveFini);
				//console.log("Okay, goodbye and keep your ears stiff!")
				break;
			default:
				protocol.handleAction(ProtocolAction.SendNak);
				//console.warn("What the fuck are you on about?!");
				return;
		}
	}

	public Attach() {
		this.Protocol.handlers = {
			[ProtocolAction.ReceiveHelo]: () => {
				//console.warn("Receiving HELO...");
			},
			[ProtocolAction.SendNak]: () => {
				this.NAK();
			},
			[ProtocolAction.SendAck]: () => {
				this.ACK();
			},
			[ProtocolAction.ReceiveSize]: () => {
				//console.warn("Receiving SIZE...");
			},
			[ProtocolAction.ReceiveData]: () => {
				//console.warn("Receiving DATA...");
			},
			[ProtocolAction.ReceiveFini]: () => {
				//console.warn("Receiving FINI...");
				this.Finish();
			}
		}
		this.socket
			.on("data", async (data) => {
				const transmissionInfo = this.ParseTransmissionInfo(data);
				await this.HandleProtocol(transmissionInfo);
			});
	}

	public get tId() {
		return this.id;
	}
}