import {Guard} from "../Util/Guard.js";

export enum ServerState {
	Idle = "Idle",
	AwaitingHelo = "AwaitingHelo",
	AwaitingCommand = "AwaitingCommand",
	AwaitingSize = "AwaitingSize",
	AwaitingData = "AwaitingData",
	Finished = "Finished",
}

export enum ProtocolAction {
	ReceiveHelo = "ReceiveHelo",
	SendAck = "SendAck",
	SendNak = "SendNak",
	ReceiveSize = "ReceiveSize",
	ReceiveData = "ReceiveData",
	ReceiveFini = "ReceiveFini",
}

export type TransitionsMap = Record<ServerState, Partial<Record<ProtocolAction, ServerState>>>;
export type HandlersMap = Partial<Record<ProtocolAction, () => void>>;

export class ProtocolStatemachine {
	private currentState: ServerState | undefined;

	private readonly transitions: TransitionsMap = {
		[ServerState.Idle]: {
			[ProtocolAction.ReceiveHelo]: ServerState.AwaitingHelo,
		},
		[ServerState.AwaitingHelo]: {
			[ProtocolAction.SendAck]: ServerState.AwaitingCommand
		},
		[ServerState.AwaitingCommand]: {
			[ProtocolAction.ReceiveSize]: ServerState.AwaitingSize,
			[ProtocolAction.ReceiveData]: ServerState.AwaitingData,
			[ProtocolAction.ReceiveFini]: ServerState.Finished,
			[ProtocolAction.SendNak]: ServerState.AwaitingCommand
		},
		[ServerState.AwaitingSize]: {
			[ProtocolAction.SendAck]: ServerState.AwaitingCommand,
			[ProtocolAction.SendNak]: ServerState.AwaitingCommand
		},
		[ServerState.AwaitingData]: {
			[ProtocolAction.SendAck]: ServerState.AwaitingCommand,
			[ProtocolAction.SendNak]: ServerState.AwaitingCommand
		},
		[ServerState.Finished]: {}
	};

	private actionHandlers: HandlersMap | undefined;

	public constructor(pActionHandlers?: HandlersMap) {
		if (pActionHandlers) {
			this.actionHandlers = pActionHandlers;
		}
		this.currentState = ServerState.Idle;
	}

	set handlers(pActionHandlers: HandlersMap) {
		this.actionHandlers = pActionHandlers;
	}

	private performAction(pAction: ProtocolAction) {
		Guard.AgainstNullish(this.actionHandlers);
		return this.actionHandlers[pAction]!();
	}

	private invalidAction(pAction: ProtocolAction) {
		console.error(`Invalid action "${pAction}" in state "${this.currentState}"`);
		return false;
	}

	public handleAction(action: ProtocolAction) {
		//console.log(`Handling action "${action}"...`);
		Guard.AgainstNullish(this.currentState);

		const nextState = this.transitions[this.currentState]?.[action];

		//console.log(`Attempting to transition from "${this.currentState}" -> "${nextState}"`)
		if (nextState) {
			this.performAction(action);
			//console.log(`Transitioned from "${this.currentState}" to "${nextState}"`)
			this.currentState = nextState;
		} else {
			this.invalidAction(action);
		}
	}
}