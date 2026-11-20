'use client';

import { patientSchema, type Patient } from '@dpms/contracts';
import { createContext, useContext, useRef, type ReactNode } from 'react';
import { ErrorState } from '@/components/ui/states';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from './api';
import { useApi } from './use-api';

interface PatientCtx {
  patient: Patient;
  reload: () => void;
}
const Ctx = createContext<PatientCtx | null>(null);

/** The patient record is loaded once per patient area (one audited view) and shared by every tab. */
export function PatientProvider({ id, children }: { id: string; children: ReactNode }) {
  const result = useApi((signal) => apiFetch(`/patients/${id}`, patientSchema, { signal }), [id]);
  // Keep showing the last good record while a refresh is in flight so open forms are not unmounted.
  const last = useRef<{ id: string; patient: Patient } | null>(null);
  if (result.status === 'success') last.current = { id, patient: result.data };
  const shown = last.current?.id === id ? last.current.patient : null;

  if (!shown) {
    if (result.status === 'error')
      return (
        <Card>
          <ErrorState error={result.error} onRetry={result.reload} />
        </Card>
      );
    return (
      <div className="space-y-3" aria-busy="true">
        <span className="sr-only">Loading patient</span>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  return <Ctx.Provider value={{ patient: shown, reload: result.reload }}>{children}</Ctx.Provider>;
}

export function usePatient(): PatientCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePatient must be used inside the patient layout');
  return c;
}
