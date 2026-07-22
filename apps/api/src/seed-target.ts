const LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  'postgres',
  'host.docker.internal',
]);

export function isLocalDatabase(connectionString: string | undefined): boolean {
  if (!connectionString) {
    return false;
  }
  try {
    const { hostname } = new URL(connectionString);
    return LOCAL_HOSTS.has(hostname.replace(/^\[/, '').replace(/\]$/, ''));
  } catch {
    return false;
  }
}

export function seedRefusalReason(
  connectionString: string | undefined,
  allowRemote: boolean,
): string | null {
  if (allowRemote || isLocalDatabase(connectionString)) {
    return null;
  }
  let target = 'an unparseable DATABASE_URL';
  if (connectionString) {
    try {
      target = new URL(connectionString).hostname;
    } catch {
      target = 'an unparseable DATABASE_URL';
    }
  } else {
    target = 'an unset DATABASE_URL';
  }
  return [
    `Refusing to seed ${target}.`,
    'The seed deletes every order, ticket, payment, refund and team member on the two demo events and recreates them, so running it against a deployed database destroys real purchase history.',
    'Only localhost and the compose stack seed without asking. Set SEED_ALLOW_REMOTE=1 to override, and read incident 8 in docs/runbook.md before you do.',
  ].join('\n');
}
