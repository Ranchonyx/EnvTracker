import EventEmitter from "node:events";
/*
* STATION   =>  [HELO <STATION_ID>]     => SERVER
* SERVER    =>  [ACK]                   => STATION
* STATION   =>  [SIZE <DATA_LENGTH>]    => SERVER
* SERVER    =>  [ACK]                   => STATION
* STATION   =>  [DATA <RAW_DATA>]       => SERVER
* SERVER    =>  [FINI]                  => STATION
* */
export default class TCPIncomingTransmission extends EventEmitter {
    socket;
    MESSAGE_BUFFER_SIZE = 4096;
    data = Buffer.alloc(this.MESSAGE_BUFFER_SIZE);
    constructor(pSocket) {
        super();
        this.socket = pSocket;
        this.socket
            .on("data", (data) => {
            const packet = data.toString("utf8");
            const [command, rest] = packet.split(" ");
            if (!["HELO", "SIZE", "DATA", "FINI",].includes(command))
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
                        this.socket.writable && this.socket.write("NAK");
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
//# sourceMappingURL=TCPIncomingTransmission.js.map