import { WorldSnapshot } from '../sim/snapshot.ts';
import { ChatMessage, SimCommand, SimEvent } from '../sim/types.ts';

export type ClientMessage =
  | {
      type: 'Command';
      seq: number;
      tick: number;
      command: SimCommand;
    }
  | {
      type: 'Join';
      mapId: string;
      playerName: string;
      vehicleTierId: string;
      level: number;
    }
  | {
      type: 'Leave';
    }
  | {
      type: 'SendChat';
      text: string;
    };

export type ServerMessage =
  | {
      type: 'Snapshot';
      snapshot: WorldSnapshot;
      lastProcessedSeq: number;
    }
  | {
      type: 'Event';
      event: SimEvent;
    }
  | {
      type: 'Ack';
      seq: number;
    }
  | {
      type: 'Chat';
      message: ChatMessage;
    }
  | {
      type: 'JoinAck';
      playerId: number;
      mapId: string;
    };
