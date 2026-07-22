import { isLocalDatabase, seedRefusalReason } from './seed-target';

describe('seed target', () => {
  const NEON =
    'postgresql://u:p@ep-cool-name-123456.ap-southeast-1.aws.neon.tech/openseat';
  const LOCAL = 'postgresql://openseat:openseat@localhost:5432/openseat';
  const COMPOSE = 'postgresql://openseat:openseat@postgres:5432/openseat';

  it('treats the developer machine and the compose stack as seedable', () => {
    expect(isLocalDatabase(LOCAL)).toBe(true);
    expect(isLocalDatabase(COMPOSE)).toBe(true);
    expect(isLocalDatabase('postgresql://u:p@127.0.0.1:5432/db')).toBe(true);
  });

  it('treats a managed database as somewhere it must not seed', () => {
    expect(isLocalDatabase(NEON)).toBe(false);
  });

  it('refuses a deployed database and names the host it refused', () => {
    const reason = seedRefusalReason(NEON, false);

    expect(reason).toContain(
      'ep-cool-name-123456.ap-southeast-1.aws.neon.tech',
    );
    expect(reason).toContain('SEED_ALLOW_REMOTE=1');
  });

  it('allows the two local targets through without a word', () => {
    expect(seedRefusalReason(LOCAL, false)).toBeNull();
    expect(seedRefusalReason(COMPOSE, false)).toBeNull();
  });

  it('lets someone who means it override the refusal', () => {
    expect(seedRefusalReason(NEON, true)).toBeNull();
  });

  it('refuses rather than guesses when DATABASE_URL is missing or malformed', () => {
    expect(seedRefusalReason(undefined, false)).toContain('unset');
    expect(seedRefusalReason('not-a-url', false)).toContain('unparseable');
  });
});
