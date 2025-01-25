import EventEmitter from "node:events";
import { ProtocolAction, ProtocolStatemachine } from "../Protocol/SADTP.js";
class DataBuffer {
    __buffer;
    pointer = 0;
    constructor(size) {
        this.__buffer = Buffer.alloc(size);
    }
    canWrite(length) {
        return (this.pointer + length) > Buffer.length;
    }
    write(data, length) {
        if (!this.canWrite(length))
            throw new Error("Unable to write past buffer limits!");
        data.copy(this.__buffer, this.pointer, 0, length);
    }
    get underlyingBuffer() {
        return this.__buffer;
    }
}
export default class Transmission extends EventEmitter {
    socket;
    BUFFER_SZ = 4096;
    clientIsIdentified = false;
    buffer = new DataBuffer(this.BUFFER_SZ);
    Protocol = new ProtocolStatemachine();
    //Initialise to "unknown" state
    requestedSize = -1;
    isFinished = false;
    id;
    constructor(pSocket, pId) {
        super();
        this.socket = pSocket;
        this.id = pId;
    }
    //#region Basic Socket actions
    Finish() {
        this.socket.end("FINI\r\n", () => {
            this.isFinished = true;
            this.socket.destroy();
            this.emit("data_available", this.buffer.underlyingBuffer);
        });
    }
    write(data) {
        return this.socket.writable && this.socket.write(data);
    }
    ACK() {
        return this.write("ACK\r\n");
    }
    NAK() {
        return this.write("NAK\r\n");
    }
    HandleHELO(param) {
        return param === "DEMO";
    }
    GuardEndpoint() {
        if (!this.clientIsIdentified) {
            console.warn(`Terminating connection with unauthenticated client.`);
            this.Finish();
        }
    }
    //#endregion
    ParseTransmissionInfo(data) {
        const packet = data.toString("utf8").slice(0, -1);
        const [command, rest] = packet.split(" ");
        const length = (rest || []).length;
        return {
            command: command,
            param: rest,
            param_length: length
        };
    }
    HandleProtocol(pTransmissionInfo) {
        const { command, param, param_length } = pTransmissionInfo;
        const protocol = this.Protocol;
        console.log(`Handling TalkCommand "${command}" ...`);
        switch (command) {
            case "HELO":
                protocol.handleAction(ProtocolAction.ReceiveHelo);
                this.clientIsIdentified = this.HandleHELO(param);
                if (!this.clientIsIdentified) {
                    console.warn("Client failed to authenticate.");
                    this.GuardEndpoint();
                    return;
                }
                protocol.handleAction(ProtocolAction.SendAck);
                console.log("Okay, client authenticated.");
                break;
            case "SIZE":
                //Guard endpoint against unauthenticated clients
                this.GuardEndpoint();
                protocol.handleAction(ProtocolAction.ReceiveSize);
                const wantedSize = parseInt(param);
                if (!this.buffer.canWrite(wantedSize)) {
                    console.log(`Unable to write ${wantedSize} bytes.`);
                    protocol.handleAction(ProtocolAction.SendNak);
                    break;
                }
                this.requestedSize = wantedSize;
                protocol.handleAction(ProtocolAction.SendAck);
                console.log(`Okay, there's enough space for ${wantedSize} bytes!`);
                break;
            case "DATA":
                //Guard endpoint against unauthenticated clients
                this.GuardEndpoint();
                protocol.handleAction(ProtocolAction.ReceiveData);
                if (this.requestedSize !== param_length) {
                    console.log(`Bad, the supplied data length is not equal to the previously requested length of ${this.requestedSize}!`);
                    protocol.handleAction(ProtocolAction.SendNak);
                    this.requestedSize = -1;
                    break;
                }
                this.buffer.write(Buffer.from(param, "utf8"), param_length);
                //Reset to "unknown" state
                this.requestedSize = -1;
                protocol.handleAction(ProtocolAction.SendAck);
                console.log(`Okay, I wrote your data "${param}" into my buffer!`);
                break;
            case "FINI":
                //Guard endpoint against unauthenticated clients
                this.GuardEndpoint();
                protocol.handleAction(ProtocolAction.ReceiveFini);
                console.log("Okay, goodbye and keep your ears stiff!");
                break;
            default:
                protocol.handleAction(ProtocolAction.SendNak);
                console.warn("What the fuck are you on about?!");
                return;
        }
    }
    Attach() {
        this.Protocol.handlers = {
            [ProtocolAction.ReceiveHelo]: () => {
                console.log("Receiving HELO...");
            },
            [ProtocolAction.SendNak]: () => {
                this.NAK();
            },
            [ProtocolAction.SendAck]: () => {
                this.ACK();
            },
            [ProtocolAction.ReceiveSize]: () => {
                console.log("Receiving SIZE...");
            },
            [ProtocolAction.ReceiveData]: () => {
                console.log("Receiving DATA...");
            },
            [ProtocolAction.ReceiveFini]: () => {
                console.log("Receiving FINI...");
                this.Finish();
            }
        };
        this.socket
            .on("data", (data) => {
            const transmissionInfo = this.ParseTransmissionInfo(data);
            this.HandleProtocol(transmissionInfo);
        });
    }
    get tId() {
        return this.id;
    }
}
//# sourceMappingURL=TCPIncomingTransmission.js.map