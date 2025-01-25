export class Channel {
	private eventMap: Map<string, CallableFunction> = new Map();

	constructor(public chid: string) {
	}

	public addListener<Parameters, Function extends (...args: Array<Parameters>) => Promise<void> = (...args: Array<Parameters>) => Promise<void>>(name: string, handler: Function) {
		this.eventMap.set(name, handler);
	}

	public removeListener(name: string) {
		const ok = this.eventMap.delete(name);
		if (!ok)
			throw new Error("Cannot remove a non-existing listener!");
	}

	public async dispatch<Parameters>(name: string, parameters: Parameters) {
		const fn = this.eventMap.get(name);
		if (!fn)
			throw new Error("Cannot dispatch to a non-existing listener!");

		await fn(parameters);
	}

	public Destroy() {
		this.eventMap.clear();
	}
}

export default class EventBus {
	private channels: Array<Channel> = [];

	public getChannel(chid: string): Channel {
		const chIndex = this.channels.findIndex(channel => channel.chid = chid);
		if(chIndex < 0) {
			this.channels.push(new Channel(chid));
			return this.channels[this.channels.length - 1];
		}

		return this.channels[chIndex];
	}

	public removeChannel(chid: string): void {
		const chIndex = this.channels.findIndex(channel => channel.chid = chid);
		if(chIndex < 0)
			throw new Error("Cannot remove a non-existing channel!");

		this.channels.splice(chIndex, 1);
	}
}