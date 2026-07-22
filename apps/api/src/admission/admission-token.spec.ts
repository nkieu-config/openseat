import { readFileSync } from 'fs';
import { join } from 'path';
import { verifyAdmissionToken } from './admission-token';

type AdmissionVector = {
  secret: string;
  visitorId: string;
  eventId: string;
  issuedAtUnix: number;
  ttlSeconds: number;
  token: string;
};

const vector = JSON.parse(
  readFileSync(
    join(
      __dirname,
      '../../../../packages/contracts/admission-token.vector.json',
    ),
    'utf8',
  ),
) as AdmissionVector;

const beforeExpiry = new Date(vector.issuedAtUnix * 1000);
const afterExpiry = new Date(
  (vector.issuedAtUnix + vector.ttlSeconds + 1) * 1000,
);

describe('verifyAdmissionToken against the shared gate vector', () => {
  it('accepts the token the gate service signed', () => {
    expect(
      verifyAdmissionToken(
        vector.secret,
        vector.token,
        vector.eventId,
        beforeExpiry,
      ),
    ).toBe(true);
  });

  it('rejects a token minted for a different event', () => {
    expect(
      verifyAdmissionToken(
        vector.secret,
        vector.token,
        'evt_someone_else',
        beforeExpiry,
      ),
    ).toBe(false);
  });

  it('rejects a token signed under a different secret', () => {
    expect(
      verifyAdmissionToken(
        'not-the-gate-secret',
        vector.token,
        vector.eventId,
        beforeExpiry,
      ),
    ).toBe(false);
  });

  it('rejects a token whose signature byte has been flipped', () => {
    const flipped =
      vector.token.slice(0, -1) + (vector.token.endsWith('A') ? 'B' : 'A');

    expect(
      verifyAdmissionToken(
        vector.secret,
        flipped,
        vector.eventId,
        beforeExpiry,
      ),
    ).toBe(false);
  });

  it('rejects the token once the clock passes its expiry', () => {
    expect(
      verifyAdmissionToken(
        vector.secret,
        vector.token,
        vector.eventId,
        afterExpiry,
      ),
    ).toBe(false);
  });

  it('rejects a structurally malformed token', () => {
    expect(
      verifyAdmissionToken(vector.secret, 'not.a.jwt', vector.eventId),
    ).toBe(false);
  });
});
