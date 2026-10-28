/**
 * Arena spectating: a delayed, reduced copy of a running match.
 *
 * Every snapshot tick the match records one frame (the public "others" view of every entity, exactly what an opponent
 * would see: no reload timers, ability cooldowns or ammo, see `viewFor`). Spectators receive the frame from
 * SPECTATE_DELAY_TICKS ago, so a stream cannot be used to help a player who is still fighting. Spectators are not part of
 * `Instance.sessions`: they take no capacity, receive no commands into the world and never touch the match state.
 */
import type { SimEntity, SimEvent } from '../shared/types.ts';

export const SPECTATE_DELAY_SECONDS = 5;
export const SPECTATE_DELAY_TICKS = SPECTATE_DELAY_SECONDS * 30; // world ticks (30 Hz)
export const MAX_SPECTATORS_PER_MATCH = 20;
const MAX_FRAMES = 160;

export interface SpectateHud { phase: string; round: number; wins: [number, number] | number[]; secondsLeft: number }

export interface SpectateFrame {
  tick: number;
  time: number;
  views: SimEntity[];
  events: SimEvent[];
  hud: SpectateHud;
}

export class MatchRecorder {
  private frames: SpectateFrame[] = [];
  private events: SimEvent[] = [];

  addEvent(ev: SimEvent): void { if (this.events.length < 500) this.events.push(ev); }

  record(tick: number, time: number, views: SimEntity[], hud: SpectateHud): void {
    this.frames.push({ tick, time, views, events: this.events, hud });
    this.events = [];
    if (this.frames.length > MAX_FRAMES) this.frames.splice(0, this.frames.length - MAX_FRAMES);
  }

  /** Newest frame that is at least `delayTicks` old at world time `nowTick`; undefined while the match is younger than the delay. */
  delayed(nowTick: number, delayTicks: number): SpectateFrame | undefined {
    const limit = nowTick - delayTicks;
    for (let i = this.frames.length - 1; i >= 0; i--) if (this.frames[i].tick <= limit) return this.frames[i];
    return undefined;
  }

  get size(): number { return this.frames.length; }
}

export interface SpectateMatchInfo {
  id: string;
  mode: string;
  league: string;
  round: number;
  wins: number[];
  phase: string;
  teams: Array<Array<{ name: string; entityId: number }>>;
  spectators: number;
  capacity: number;
}
