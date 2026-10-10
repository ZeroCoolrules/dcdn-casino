// Matchmaker actor — a single global "lobby" room where players queue for random pairing.
// When two players are waiting, mints a private pair-room id (UUID) and tells each to
// connect to the VideoChat actor under that id, assigning offer/answer roles.
import { Actor } from 'base44:runtime/actors';

export default class Matchmaker extends Actor {
  waiting = []; // conn.id queue of players searching

  connById(id) {
    return this.getConnections().find((c) => c.id === id);
  }

  async handleStart() {
    // hibernation rehydrate: drop stale waiters
    const live = new Set(this.getConnections().map((c) => c.id));
    this.waiting = this.waiting.filter((id) => live.has(id));
  }

  async handleConnect(conn) {
    this.waiting.push(conn.id);
    conn.send({ type: 'searching' });
    this.tryPair();
  }

  async handleClose(conn) {
    this.waiting = this.waiting.filter((id) => id !== conn.id);
  }

  async handleMessage(conn, msg) {
    // No client-originated operations on the matchmaker beyond connecting.
  }

  tryPair() {
    while (this.waiting.length >= 2) {
      const a = this.waiting.shift();
      const b = this.waiting.shift();
      const ca = this.connById(a);
      const cb = this.connById(b);
      if (!ca || !cb) {
        // one dropped mid-pair: re-queue the survivor
        if (ca) { this.waiting.unshift(a); ca.send({ type: 'searching' }); }
        if (cb) { this.waiting.unshift(b); cb.send({ type: 'searching' }); }
        continue;
      }
      const pairId = crypto.randomUUID();
      ca.send({ type: 'paired', room: pairId, role: 'offer' });
      cb.send({ type: 'paired', room: pairId, role: 'answer' });
    }
  }
}