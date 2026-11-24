# WebSocket authority

This is a room relay, not a physics or inventory authority. The connection that claimed a name owns that claim; the relay assigns room IDs and the host socket. Choosable names, positions and UID strings do not confer another connection's rights. Shared worlds can use Survival or Creative; the older `classic` wire edition remains supported for existing clients and is creative-only. Current clients restrict chest/furnace use and mining to the host and disable storage-minecart placement, use and destruction in multiplayer, but these client-side safeguards do not bind old or modified clients.

| Message from client | Who can act and what they may change |
|---|---|
| `ping`, `players:list`, `rooms:list` | Anyone connected. Read only; the room list shows public rooms with space. |
| `player:claim`, `player:release` | Connection may claim an available case-insensitive name or release its own claim. Release leaves its room. Disconnect also releases it. |
| `room:create` | Named client not in a room becomes its room's host. Edition, Survival/Creative mode, seed, access, optional room password and optional shared visuals are set at creation. |
| `room:join`, `room:leave` | Named client acts for itself; join needs a matching room code, password if set, and a free slot. A host leaving closes its room. |
| `room:close` | Current room's host only. |
| `player:state`, `chat` | Current members act as themselves. Relay stamps the sending identity. Other clients cannot update that identity. |
| `world:snapshot` | Host may publish validated edit batches. Canonical block coordinates identify entries, not an owning player. |
| `world:edit` | Any member may place/remove a valid block within its edition's build bounds. Last accepted edit at a coordinate wins; air removes a block. |
| `game:state` | Host publishes shared time and legacy world state under the payload limit. |
| `item:snapshot` | Host replaces the shared drop collection, including removal by omission. Snapshot IDs must be unique. |
| `item:spawn` | Host can publish valid drops; guests may publish valid drops near their last reported live position. IDs are scoped to the sender and cannot replace live drops. |
| `item:pickup` | Any member with a reported live position within five blocks may request an existing drop. The relay removes it first, grants it only to the requester, and tells peers to remove it. Clients cannot issue the grant. |
| `projectile:update`, `projectile:remove` | A member may create a player projectile or control its own existing projectile; only the host creates mob projectiles. Host may also update/remove other projectiles without changing the source or projectile kind. Relay expiry and sender disconnect remove stale projectiles. |
| `vehicle:update`, `vehicle:remove` | First valid creation sets the owner. Only the owner may update the existing vehicle and its type cannot change. Owner or host may remove it. Guest departure hands its vehicles to the host and clears the riding flag. |
| `tnt:ignite`, `mob:attack` | Guest can submit bounded requests for the host to validate and simulate; neither message grants damage or changes an entity. |
| `player:damage`, `mob:snapshot` | Host alone may relay bounded damage to a current player or replace the shared mob list with valid, unique records. |

Server-only types: `pong`, `error`, `player:claimed`, `player:released`, `player:joined`, `player:left`, `room:joined`, `room:left`, `room:closed`, `world:snapshot:accepted`, `item:remove`, `vehicle:snapshot`, and `projectile:snapshot`. The relay also emits the compatible list, state, update, and removal notifications in the table. Server notifications are not authority a client can claim by reflecting them back.

Only recognized text JSON messages reach handlers. The transport caps messages at 1 MiB; recognized messages other than room creation, world/item snapshot and game state have a 64 KiB cap. Handlers further bound rates, collection sizes and key fields. These checks do not prove reported positions, physics, inventory conservation or host correctness. Rooms and names remain process-local, with at most five rooms and five players per room.
