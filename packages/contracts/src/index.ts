export const API_PREFIX = '/api';

export type HealthResponse = {
  status: 'ok';
  uptimeSeconds: number;
  version: string;
};
