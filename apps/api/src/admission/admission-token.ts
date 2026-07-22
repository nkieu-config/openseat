import { createHmac, timingSafeEqual } from 'crypto';

function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

export function verifyAdmissionToken(
  secret: string,
  token: string,
  eventId: string,
  now: Date = new Date(),
): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return false;
  }
  const [header, payload, signature] = parts;
  const expected = createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  if (!safeEqual(expected, signature)) {
    return false;
  }
  try {
    const claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as { eventId?: string; exp?: number };
    if (claims.eventId !== eventId) {
      return false;
    }
    if (!claims.exp || now.getTime() / 1000 >= claims.exp) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
