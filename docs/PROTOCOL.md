# Treadfront — Network Protocol Specification

**Protocol Version**: `1.0.0`
**Transport**: WebSocket (`ws://` / `wss://`) + JSON / binary payload frame
**Rates**:
- Client Input Rate: Up to 30 Hz (batched commands with monotonic sequence number `seq`)
- Server Simulation Rate: Fixed 30 Hz (`SIM_TIMESTEP = 1/30` s)
- Server Snapshot Rate: 10 Hz (`SERVER_SNAPSHOT_RATE = 10`)

---

## 1. Handshake & Version Gate
1. Client connects via WebSocket to `/ws`.
2. Client sends `c_join`:
   ```json
   {
     "type": "c_join",
     "protocolVersion": "1.0.0",
     "accountId": "usr_991823",
     "secret": "h4sh3ds3cr3t",
     "selectedVehicleId": "veh_starter_scout"
   }
   ```
3. If `protocolVersion` does not match server requirement, server replies with `s_error` (`code: "ERR_VERSION_MISMATCH"`, `critical: true`) and closes connection.
4. On success, server replies with `s_welcome`:
   ```json
   {
     "type": "s_welcome",
     "protocolVersion": "1.0.0",
     "assignedEntityId": 1042,
     "mapId": "green_valley",
     "serverTick": 18230
   }
   ```

---

## 2. Client-to-Server Messages

### 2.1 Input Commands (`c_input`)
```typescript
interface ClientInputPacket {
  type: 'c_input';
  seq: number; // Client input sequence number
  commands: SimCommand[];
  clientTime: number;
}
```
Supported `SimCommand` types:
- `Drive { x: number, y: number }`
- `SetTarget { targetId: number | null }`
- `ToggleAutoFire { enabled?: boolean }`
- `FireMain`
- `UseAbility { abilityId: AbilityId, targetPos?: Vec2 }`
- `SelectAmmo { ammo: AmmoType }`
- `EnterGate { gateId?: string }`
- `Interact { targetId?: number }`

### 2.2 Chat (`c_chat`)
```typescript
interface ClientChatPacket {
  type: 'c_chat';
  channel: 'G' | 'M' | 'F' | 'C' | 'P';
  text: string;
  targetRecipient?: string;
}
```

---

## 3. Server-to-Client Messages

### 3.1 World Snapshot (`s_snapshot`)
Broadcast at 10 Hz containing entities in player's spatial interest grid:
```typescript
interface ServerSnapshotPacket {
  type: 's_snapshot';
  tick: number;
  lastProcessedSeq: number; // For client prediction replay
  serverTime: number;
  entities: EntitySnapshot[];
  events: SimEvent[];
}
```

### 3.2 Delta Snapshot (`s_delta`)
Sent between full snapshots for bandwidth optimization:
```typescript
interface ServerDeltaPacket {
  type: 's_delta';
  tick: number;
  lastProcessedSeq: number;
  serverTime: number;
  updated: Partial<EntitySnapshot>[];
  removedIds: number[];
  events: SimEvent[];
}
```

### 3.3 Chat Broadcast (`s_chat`)
```typescript
interface ServerChatPacket {
  type: 's_chat';
  message: ChatMessage;
}
```

## Clan storage and alliances (social ops)

`clan_storage` -> `{capacity, minRole, items:[{id,item,by,ts}], log, withdrawalsLeft}`; `clan_deposit {uid}`, `clan_withdraw {id}` (safe zone only, return the same view); `clan_storage_policy {minRole}` (leader);
`clan_allies` -> `[{clanId,name,tag,emblem,status:'active'|'incoming'|'outgoing',since}]`; `clan_ally_propose {tag}` (officer+), `clan_ally_accept|decline|break {clanId}` (leader; officers may decline).
Errors: `storage_full`, `daily_limit`, `inventory_full`, `item_bound`, `item_equipped`, `no_permission`, `unknown_clan`, `already_allied`, `already_proposed`, `ally_limit`, `target_ally_limit`, `ally_cooldown`, `no_proposal`, `not_allied`.
Chat channel `A` reaches the own clan plus allied clans. Social events `clan_storage` / `clan_allies` tell clan members to refresh.
