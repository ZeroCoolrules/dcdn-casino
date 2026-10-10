// HoldemLobby — a single shared room tracking live seat presence for cash
// Hold'em tables (6 seats each). Tables spawn on demand: the floor starts with
// one open table, and a new empty table is spawned the moment an existing
// table fills, up to a hard MAX_TABLES cap. Empty trailing tables collapse so
// the floor never shows dead rooms. Presence is ephemeral and reconciled
// against live connections on every wake.
import { Actor } from 'base44:runtime/actors';

const MAX_TABLES = 6;
const SEATS = 6;
const emptyTable = () => [null, null, null, null, null, null];

export default class HoldemLobby extends Actor {
  tables = []; // tables[i] = array of 6: null or { connId, name }

  normalize() {
    if (!Array.isArray(this.tables)) this.tables = [];
    // Guarantee at least one table exists for players to sit at.
    if (this.tables.length === 0) this.tables.push(emptyTable());
  }

  async handleStart() {
    this.normalize();
    const live = new Set(this.getConnections().map((c) => c.id));
    for (const t of this.tables) {
      for (let i = 0; i < t.length; i++) {
        if (t[i] && !live.has(t[i].connId)) t[i] = null;
      }
    }
    this.collapse();
  }

  async handleConnect(conn) {
    this.normalize();
    conn.send({ type: 'state', tables: this.project() });
  }

  async handleMessage(conn, msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'join') {
      const name = String(msg.name || 'Player').slice(0, 24);
      this.freeSeat(conn.id);
      this.normalize();
      // Preferred table only if it exists and still has a free seat; otherwise
      // auto-assign to the first open seat across the live floor.
      let target = -1;
      if (Number.isInteger(msg.table) && msg.table >= 0 && msg.table < this.tables.length && this.tables[msg.table].some((s) => s === null)) {
        target = msg.table;
      } else {
        target = this.tables.findIndex((t) => t.some((s) => s === null));
      }
      if (target === -1) {
        // Floor is full: every table is seated and we're at the cap.
        conn.send({ type: 'floor_full' });
        return;
      }
      const t = this.tables[target];
      const seat = t.findIndex((s) => s === null);
      t[seat] = { connId: conn.id, name };
      conn.send({ type: 'seated', table: target, seat });
      // Spawn a fresh table the instant this one fills, so the next player has
      // somewhere to sit without waiting for a manual broadcast cycle.
      if (t.every((s) => s !== null) && this.tables.length < MAX_TABLES) {
        this.tables.push(emptyTable());
      }
      this.broadcastState();
    } else if (msg.type === 'leave') {
      this.freeSeat(conn.id);
      this.collapse();
      this.broadcastState();
    }
  }

  async handleClose(conn) {
    this.freeSeat(conn.id);
    this.collapse();
    this.broadcastState();
  }

  freeSeat(connId) {
    this.normalize();
    for (const t of this.tables) {
      for (let i = 0; i < t.length; i++) if (t[i] && t[i].connId === connId) t[i] = null;
    }
  }

  // Drop empty trailing tables (keep at least one) so the lobby never advertises
  // dead rooms; an active table with seated players is never removed.
  collapse() {
    this.normalize();
    while (this.tables.length > 1 && this.tables[this.tables.length - 1].every((s) => s === null)) {
      this.tables.pop();
    }
  }

  // Public shape — names only, never connId (client-held, must stay server-side).
  project() {
    return this.tables.map((t) => t.map((s) => (s ? { name: s.name } : null)));
  }

  broadcastState() {
    this.broadcast({ type: 'state', tables: this.project() });
  }
}