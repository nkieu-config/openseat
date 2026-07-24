import { execSync } from 'node:child_process';

export default function globalSetup() {
  execSync('pnpm --filter @openseat/api db:seed', { stdio: 'inherit' });
}
