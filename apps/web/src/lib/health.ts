import { livenessSchema, readinessSchema, type Liveness, type Readiness } from '@dpms/contracts';
import { apiFetch } from './api';

export const fetchLiveness = (signal?: AbortSignal): Promise<Liveness> =>
  apiFetch('/health', livenessSchema, { signal });

/** Readiness returns 503 with a valid body when the database is down; that body is data, not an error. */
export async function fetchReadiness(signal?: AbortSignal): Promise<Readiness> {
  const res = await fetch('/api/v1/health/ready', { cache: 'no-store', signal });
  return readinessSchema.parse(await res.json());
}
