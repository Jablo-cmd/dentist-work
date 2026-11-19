'use client';

import {
  ALLERGY_SEVERITIES,
  HISTORY_CATEGORIES,
  addAllergyRequestSchema,
  addContactRequestSchema,
  addHistoryEntryRequestSchema,
  medicalHistorySchema,
  patientSchema,
  updatePatientRequestSchema,
  type MedicalHistory,
  type Patient,
} from '@dpms/contracts';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { PatientFields } from '@/components/patient-form';
import { useToast } from '@/components/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { apiFetch } from '@/lib/api';
import { describeError } from '@/lib/errors';
import { formValues } from '@/lib/form';
import { can } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

const today = () => new Date().toISOString().slice(0, 10);

export default function PatientPage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useSession();
  const patient = useApi((signal) => apiFetch(`/patients/${id}`, patientSchema, { signal }), [id]);
  if (state.status !== 'authenticated') return null;
  if (patient.status === 'loading')
    return (
      <div className="space-y-3" aria-busy="true">
        <span className="sr-only">Loading patient</span>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  if (patient.status === 'error')
    return (
      <Card>
        <ErrorState error={patient.error} onRetry={patient.reload} />
      </Card>
    );
  return <PatientView patient={patient.data} reload={patient.reload} />;
}

function PatientView({ patient, reload }: { patient: Patient; reload: () => void }) {
  const { state } = useSession();
  const { notify } = useToast();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (state.status !== 'authenticated') return null;
  const user = state.user;

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const { practiceId: _p, ...values } = formValues(e.currentTarget);
    const parsed = updatePatientRequestSchema.safeParse(values);
    if (!parsed.success)
      return setError(
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    try {
      await apiFetch(`/patients/${patient.id}`, patientSchema, {
        method: 'PATCH',
        body: parsed.data,
      });
      notify('success', 'Patient updated.');
      setEditing(false);
      reload();
    } catch (err) {
      setError(describeError(err));
    }
  }

  async function addContact(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const parsed = addContactRequestSchema.safeParse(formValues(form));
    if (!parsed.success)
      return notify('error', parsed.error.issues.map((i) => i.message).join('; '));
    try {
      await apiFetch(`/patients/${patient.id}/contacts`, patientSchema, {
        method: 'POST',
        body: parsed.data,
      });
      form.reset();
      reload();
    } catch (err) {
      notify('error', describeError(err));
    }
  }

  const row = (label: string, value: string | null) => (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value || '—'}</dd>
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {patient.firstName} {patient.lastName}
          </h1>
          <p className="text-sm text-muted-foreground">
            Born {patient.dateOfBirth}
            {!patient.isActive && ' · Inactive'}
          </p>
        </div>
        {can(user, 'patient.update') && (
          <Button variant="outline" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Cancel' : 'Edit details'}
          </Button>
        )}
      </div>

      {patient.severeAllergyCount !== null && patient.severeAllergyCount > 0 && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md border border-danger/40 bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
        >
          <AlertTriangle className="h-4 w-4" aria-hidden /> {patient.severeAllergyCount} severe
          allerg{patient.severeAllergyCount > 1 ? 'ies' : 'y'} recorded — see medical history.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          {editing ? (
            <form onSubmit={save} className="space-y-4">
              <PatientFields patient={patient} />
              {error && (
                <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                  {error}
                </p>
              )}
              <Button type="submit">Save changes</Button>
            </form>
          ) : (
            <dl className="grid gap-3 sm:grid-cols-3">
              {row('Preferred name', patient.preferredName)}
              {row('Sex', patient.sex.toLowerCase())}
              {row('ID / passport', patient.idNumber)}
              {row('Mobile', patient.mobilePhone)}
              {row('Other phone', patient.homePhone)}
              {row('Email', patient.email)}
              {row(
                'Address',
                [
                  patient.addressLine1,
                  patient.addressLine2,
                  patient.suburb,
                  patient.city,
                  patient.postalCode,
                ]
                  .filter(Boolean)
                  .join(', '),
              )}
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Emergency contacts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {patient.contacts.length === 0 && (
            <p className="text-sm text-muted-foreground">No contacts recorded.</p>
          )}
          <ul className="divide-y text-sm">
            {patient.contacts.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2">
                <span>
                  <span className="font-medium">{c.name}</span> · {c.relationship} · {c.phone}
                </span>
                {can(user, 'patient.update') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      void apiFetch(`/patients/${patient.id}/contacts/${c.id}`, patientSchema, {
                        method: 'DELETE',
                      }).then(reload, (e) => notify('error', describeError(e)))
                    }
                  >
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {can(user, 'patient.update') && (
            <form onSubmit={addContact} className="flex flex-wrap items-end gap-2">
              <Field id="c-name" label="Name">
                <Input id="c-name" name="name" required />
              </Field>
              <Field id="c-rel" label="Relationship">
                <Input id="c-rel" name="relationship" required />
              </Field>
              <Field id="c-phone" label="Phone">
                <Input id="c-phone" name="phone" type="tel" required />
              </Field>
              <Button type="submit" size="sm">
                Add
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {can(user, 'clinical_record.read') && (
        <Link
          href={`/patients/${patient.id}/clinical`}
          className="inline-flex h-10 items-center rounded-md border bg-card px-4 text-sm font-medium hover:bg-muted"
        >
          Open clinical record (notes, dental chart, treatment plans)
        </Link>
      )}

      {patient.severeAllergyCount !== null && (
        <MedicalHistoryCard
          patientId={patient.id}
          canEdit={can(user, 'medical_history.update')}
          onChange={reload}
        />
      )}
    </div>
  );
}

function MedicalHistoryCard({
  patientId,
  canEdit,
  onChange,
}: {
  patientId: string;
  canEdit: boolean;
  onChange: () => void;
}) {
  const { notify } = useToast();
  const history = useApi(
    (signal) =>
      apiFetch(`/patients/${patientId}/medical-history`, medicalHistorySchema, { signal }),
    [patientId],
  );

  async function submit(e: FormEvent<HTMLFormElement>, kind: 'medical-history' | 'allergies') {
    e.preventDefault();
    const form = e.currentTarget;
    const raw = formValues(form);
    const parsed =
      kind === 'allergies'
        ? addAllergyRequestSchema.safeParse({ ...raw, reaction: raw.reaction || null })
        : addHistoryEntryRequestSchema.safeParse({ ...raw, isAlert: raw.isAlert === 'on' });
    if (!parsed.success)
      return notify(
        'error',
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    try {
      await apiFetch(`/patients/${patientId}/${kind}`, medicalHistorySchema, {
        method: 'POST',
        body: parsed.data,
      });
      form.reset();
      history.reload();
      onChange();
    } catch (err) {
      notify('error', describeError(err));
    }
  }
  async function resolve(kind: 'medical-history' | 'allergies', id: string) {
    try {
      await apiFetch(`/patients/${patientId}/${kind}/${id}/resolve`, medicalHistorySchema, {
        method: 'POST',
      });
      history.reload();
      onChange();
    } catch (err) {
      notify('error', describeError(err));
    }
  }

  const list = (h: MedicalHistory) => (
    <div className="grid gap-6 md:grid-cols-2">
      <section aria-label="Allergies">
        <h3 className="mb-2 text-sm font-semibold">Allergies</h3>
        {h.allergies.length === 0 && (
          <p className="text-sm text-muted-foreground">None recorded.</p>
        )}
        <ul className="space-y-2 text-sm">
          {h.allergies.map((a) => (
            <li key={a.id} className={a.resolvedAt ? 'opacity-60' : ''}>
              <span className="font-medium">{a.substance}</span>{' '}
              <Badge
                tone={
                  a.severity === 'SEVERE'
                    ? 'danger'
                    : a.severity === 'MODERATE'
                      ? 'warning'
                      : 'neutral'
                }
              >
                {a.severity.toLowerCase()}
              </Badge>
              {a.resolvedAt && <Badge className="ml-1">resolved</Badge>}
              <p className="text-muted-foreground">
                {a.reaction ?? 'No reaction noted'} · {a.source} · {a.recordedOn}
              </p>
              {canEdit && !a.resolvedAt && (
                <Button variant="ghost" size="sm" onClick={() => void resolve('allergies', a.id)}>
                  Mark resolved
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Medical history">
        <h3 className="mb-2 text-sm font-semibold">Medical history</h3>
        {h.entries.length === 0 && <p className="text-sm text-muted-foreground">None recorded.</p>}
        <ul className="space-y-2 text-sm">
          {h.entries.map((e) => (
            <li key={e.id} className={e.resolvedAt ? 'opacity-60' : ''}>
              <span className="font-medium">{e.description}</span>{' '}
              {e.isAlert && <Badge tone="warning">alert</Badge>}{' '}
              {e.resolvedAt && <Badge>resolved</Badge>}
              <p className="text-muted-foreground">
                {e.category.toLowerCase()} · {e.source} · {e.recordedOn}
              </p>
              {canEdit && !e.resolvedAt && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void resolve('medical-history', e.id)}
                >
                  Mark resolved
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Medical history and allergies</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {history.status === 'loading' && <Skeleton className="h-24 w-full" />}
        {history.status === 'error' && (
          <ErrorState error={history.error} onRetry={history.reload} />
        )}
        {history.status === 'success' && list(history.data)}
        {canEdit && (
          <div className="grid gap-6 border-t pt-4 md:grid-cols-2">
            <form onSubmit={(e) => void submit(e, 'allergies')} className="space-y-2">
              <h3 className="text-sm font-semibold">Add allergy</h3>
              <Field id="al-sub" label="Substance">
                <Input id="al-sub" name="substance" required />
              </Field>
              <Field id="al-rea" label="Reaction">
                <Input id="al-rea" name="reaction" />
              </Field>
              <Field id="al-sev" label="Severity">
                <Select id="al-sev" name="severity" defaultValue="UNKNOWN">
                  {ALLERGY_SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {s.toLowerCase()}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="al-src" label="Source">
                <Input id="al-src" name="source" defaultValue="Patient reported" required />
              </Field>
              <Field id="al-date" label="Date noted">
                <Input id="al-date" name="recordedOn" type="date" defaultValue={today()} required />
              </Field>
              <Button type="submit" size="sm">
                Add allergy
              </Button>
            </form>
            <form onSubmit={(e) => void submit(e, 'medical-history')} className="space-y-2">
              <h3 className="text-sm font-semibold">Add history entry</h3>
              <Field id="mh-cat" label="Category">
                <Select id="mh-cat" name="category" defaultValue="CONDITION">
                  {HISTORY_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c.toLowerCase()}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="mh-desc" label="Description">
                <Input id="mh-desc" name="description" required />
              </Field>
              <Field id="mh-src" label="Source">
                <Input id="mh-src" name="source" defaultValue="Patient reported" required />
              </Field>
              <Field id="mh-date" label="Date noted">
                <Input id="mh-date" name="recordedOn" type="date" defaultValue={today()} required />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isAlert" /> Clinical alert
              </label>
              <Button type="submit" size="sm">
                Add entry
              </Button>
            </form>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Entries cannot be edited. To correct one, mark it resolved and add a new entry; the
          history is preserved.
        </p>
      </CardContent>
    </Card>
  );
}
