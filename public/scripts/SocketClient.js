class SocketClient {
    static #instance;
    #disconnectTimeout;
    #wsUrl;
    #client;
    #queue = [];

    static getInstance(pOnMessage, pUrl, pProto) {
        if (!SocketClient.#instance)
            SocketClient.#instance = new SocketClient(pOnMessage, pUrl, pProto);
        return SocketClient.#instance;
    }

    #ResetDisconnectCountdown() {
        clearTimeout(this.#disconnectTimeout);

        this.#disconnectTimeout = setTimeout(() => {
            console.warn("Server has gone away. Disconnecting!");
            this.Destroy();
        }, 15000 + 2000);
    }

    constructor(pOnMessage, pHost = document.location.host) {
        const proto = location.protocol === "https" ? "wss" : "ws";
        this.#wsUrl = `${proto}://${pHost}`;

        this.#client = new WebSocket(this.#wsUrl);

        this.#client.onerror = (ev) => {
            console.error(ev);
        };

        this.#client.onopen = () => {
            console.warn("Started WebSocket connection.");

            if (this.#queue.length > 0) {
                let message = "";
                while ((message = this.#queue.shift())) {
                    console.warn(`Sending queued message (${message})`);
                    this.#client.send(message);
                }
            }

            this.#ResetDisconnectCountdown();
        }

        this.#client.onclose = () => {
            console.error("WebSocket connection closed.")
            this.Destroy();
        }

        this.#client.onmessage = (ev) => {
            switch (ev.data) {
                case "ping":
                    //We're being pinged. Answer pong immediately
                    this.#client.send("pong");
                    this.#ResetDisconnectCountdown();
                    break;
                default:
                    pOnMessage(ev.data);
            }
        };

    }

    Destroy() {
        this.#client.close();
        clearInterval(this.#disconnectTimeout);
    }

    Send(data) {
        if (this.#client.readyState !== WebSocket.OPEN) {
            this.#queue.push(data);
            return;
        }

        this.#client.send(data);
    }
}