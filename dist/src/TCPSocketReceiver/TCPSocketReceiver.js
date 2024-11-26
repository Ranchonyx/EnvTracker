import { createServer } from "node:net";
import TCPIncomingTransmission from "./TCPIncomingTransmission.js";
import EventEmitter from "node:events";
export default class SocketReceiver extends EventEmitter {
    port;
    server = null;
    transmissions = [];
    constructor(pPort) {
        super();
        this.port = pPort;
    }
    Start() {
        console.log(`Starting socket receiver on port ${this.port}`);
        this.server =
            createServer((socket) => {
                const transmission = new TCPIncomingTransmission(socket);
                transmission.on("data_available", (data) => {
                    console.log("TRANSMISSION_FINISHED", data);
                    this.emit("transmission_finished", data);
                });
                this.transmissions.push(transmission);
            });
        this.server.listen(this.port);
        console.log("Listening?", this.server.listening);
    }
}
//# sourceMappingURL=TCPSocketReceiver.js.map