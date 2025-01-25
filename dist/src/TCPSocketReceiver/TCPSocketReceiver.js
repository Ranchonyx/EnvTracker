import { createServer } from "node:net";
import TalkTransmission from "../TalkProtocol/TalkTransmission.js";
import EventEmitter from "node:events";
export default class SocketReceiver extends EventEmitter {
    onMeasurement;
    mdb_api;
    port;
    server = null;
    __nextId = 0;
    log;
    transmissions = [];
    constructor(pPort, pLogger, onMeasurement, mdb_api) {
        super();
        this.onMeasurement = onMeasurement;
        this.mdb_api = mdb_api;
        this.log = pLogger;
        this.port = pPort;
    }
    Start() {
        this.server =
            createServer((socket) => {
                const tId = this.__nextId++;
                const transmission = new TalkTransmission(socket, tId, this.mdb_api);
                transmission.Attach();
                transmission.on("data_available", (station_id, data) => {
                    const myIdx = this.transmissions.findIndex(tr => tr.tId === tId);
                    const oldTransmission = this.transmissions.splice(myIdx, 1);
                    if (!oldTransmission[0].clientIsIdentified)
                        return;
                    this.onMeasurement(station_id, data);
                });
                this.transmissions.push(transmission);
            });
        this.server.listen(this.port, () => {
            this.log(`SocketReceiver listening on ${this.port}`);
        });
    }
}
//# sourceMappingURL=TCPSocketReceiver.js.map