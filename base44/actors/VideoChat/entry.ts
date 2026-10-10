// VideoChat actor — a private pair room (2 participants) that relays WebRTC signaling
// (offer / answer / ice) between two players and notifies on skip / disconnect.
// The actual video/audio streams flow peer-to-peer; this room only brokers signaling.
import { Actor } from 'base44:runtime/actors';

const MAX = 2;

export default class VideoChat extends Actor {
  participants = new Map(); // conn.id -> partnerConnId (null until paired)

  connById(id) {
    return this.getConnections().find((c) => c.id === id);
  }

  async handleStart() {
    const live = new Set(this.getConnections().map((c) => c.id));
    for (const id of [...this.participants.keys()]) {
      if (!live.has(id)) this.participants.delete(id);
    }
  }

  async handleConnect(conn) {
    if (this.participants.size >= MAX) {
      conn.reject(4001, 'pair full');
      return;
    }
    this.participants.set(conn.id, null);

    if (this.participants.size === 2) {
      const [a, b] = [...this.participants.keys()];
      this.participants.set(a, b);
      this.participants.set(b, a);
      const ca = this.connById(a);
      const cb = this.connById(b);
      if (ca) ca.send({ type: 'peer_ready' });
      if (cb) cb.send({ type: 'peer_ready' });
    } else {
      conn.send({ type: 'waiting' });
    }
  }

  async handleMessage(conn, msg) {
    if (!msg || typeof msg !== 'object') return;
    const partnerId = this.participants.get(conn.id);
    if (!partnerId) return;
    const partner = this.connById(partnerId);
    if (!partner) return;

    if (msg.type === 'offer' || msg.type === 'answer') {
      partner.send({ type: msg.type, sdp: msg.sdp });
    } else if (msg.type === 'ice') {
      partner.send({ type: 'ice', candidate: msg.candidate });
    } else if (msg.type === 'skip') {
      partner.send({ type: 'peer_left', reason: 'skip' });
      conn.send({ type: 'peer_left', reason: 'you_skipped' });
    }
  }

  async handleClose(conn) {
    const partnerId = this.participants.get(conn.id);
    this.participants.delete(conn.id);
    if (partnerId) {
      const partner = this.connById(partnerId);
      if (partner) partner.send({ type: 'peer_left', reason: 'disconnect' });
      this.participants.delete(partnerId);
    }
  }
}