import { execSync } from 'node:child_process';

export default function globalSetup() {
  execSync('pnpm --filter api db:seed', { stdio: 'inherit' });
}
