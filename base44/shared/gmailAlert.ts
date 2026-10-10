// gmailAlert — fire-and-forget Gmail notification to the operator (the connected
// builder Gmail account) using the shared Gmail connector. Used to alert on
// verified real-money deposits. Content is ASCII-only (no RFC 2047 needed), and
// every failure is swallowed so a notification problem can never break or delay
// the deposit flow. Call this only via `waitUntil(...)`.

const GMAIL_SEND = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const USERINFO = 'https://www.googleapis.com/oauth2/v2/userinfo';

function b64url(input: string): string {
  return btoa(unescape(encodeURIComponent(input)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export interface DepositAlertInfo {
  amount: number;
  fromAddress: string;
  txHash: string;
  balance: number;
}

export async function sendDepositAlert(base44: any, info: DepositAlertInfo): Promise<void> {
  try {
    const conn = await base44.asServiceRole.connectors.getConnection('gmail');
    if (!conn || !conn.accessToken) return;
    const authHeader = { Authorization: `Bearer ${conn.accessToken}` };

    // Resolve the operator's own email (granted via the `email` scope on connect).
    let toAddr = '';
    try {
      const ures = await fetch(USERINFO, { headers: authHeader, signal: AbortSignal.timeout(8000) });
      if (ures.ok) {
        const udata: any = await ures.json();
        toAddr = String(udata.email || '').trim();
      }
    } catch {}
    if (!toAddr) return; // cannot address a notification without the operator email

    const subject = `New verified deposit: ${info.amount} DCDN`;
    const body =
      'A real-money deposit was just verified and credited to a player vault.\n\n' +
      `Amount credited: ${info.amount} DCDN\n` +
      `From address: ${info.fromAddress}\n` +
      `Tx hash: ${info.txHash}\n` +
      `New vault balance: ${info.balance} DCDN\n\n` +
      'Dreamcadian Casino - operator alert';

    const mime =
      `Date: ${new Date().toUTCString()}\r\n` +
      `To: ${toAddr}\r\n` +
      `From: ${toAddr}\r\n` +
      `Subject: ${subject}\r\n` +
      'MIME-Version: 1.0\r\n' +
      'Content-Type: text/plain; charset=US-ASCII\r\n' +
      'Content-Transfer-Encoding: 7bit\r\n\r\n' +
      `${body}\r\n`;

    await fetch(GMAIL_SEND, {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: b64url(mime) }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    // swallowed by design: notifications must never affect the deposit flow
  }
}