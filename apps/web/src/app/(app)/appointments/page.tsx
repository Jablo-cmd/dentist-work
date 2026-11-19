'use client';

import {
  appointmentSchema,
  createAppointmentRequestSchema,
  paginatedSchema,
  patientSummarySchema,
  practiceSchema,
  practitionerSchema,
  type Appointment,
} from '@dpms/contracts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { useToast } from '@/components/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { apiFetch } from '@/lib/api';
import { describeError } from '@/lib/errors';
import { formValues } from '@/lib/form';
import { can } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import { addDays, formatDay, formatTime, sastDate, sastInstant } from '@/lib/time';
import { useApi } from '@/lib/use-api';

const TONE = {
  SCHEDULED: 'neutral',
  CHECKED_IN: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  NO_SHOW: 'danger',
} as const;

export default function AppointmentsPage() {
  const { state } = useSession();
  const { notify } = useToast();
  const [date, setDate] = useState(() => sastDate(new Date()));
  const [view, setView] = useState<'day' | 'week'>('day');
  const [practiceId, setPracticeId] = useState('');
  const [practitionerId, setPractitionerId] = useState('');
  const [showForm, setShowForm] = useState(false);

  const practices = useApi((s) =>
    apiFetch('/practices?pageSize=100', paginatedSchema(practiceSchema), { signal: s }),
  );
  const activePractice =
    practiceId || (practices.status === 'success' ? (practices.data.data[0]?.id ?? '') : '');
  const practitioners = useApi(
    async (s) =>
      activePractice
        ? apiFetch(
            `/appointments/practitioners?practiceId=${activePractice}`,
            z.array(practitionerSchema),
            { signal: s },
          )
        : [],
    [activePractice],
  );
  const days = view === 'day' ? 1 : 7;
  const appts = useApi(
    async (s) => {
      if (!activePractice) return [];
      const qs = new URLSearchParams({
        from: sastInstant(date, '00:00'),
        to: sastInstant(addDays(date, days), '00:00'),
        practiceId: activePractice,
      });
      if (practitionerId) qs.set('practitionerUserId', practitionerId);
      return apiFetch(`/appointments?${qs}`, z.array(appointmentSchema), { signal: s });
    },
    [activePractice, practitionerId, date, view],
  );
  if (state.status !== 'authenticated') return null;
  const manage = can(state.user, 'appointment.manage');

  async function act(id: string, path: string, body?: object, okMsg = 'Updated.') {
    try {
      await apiFetch(`/appointments/${id}/${path}`, appointmentSchema, {
        method: 'POST',
        body: body ?? {},
      });
      notify('success', okMsg);
      appts.reload();
    } catch (err) {
      notify('error', describeError(err));
    }
  }

  const grouped = new Map<string, Appointment[]>();
  if (appts.status === 'success')
    for (const a of appts.data)
      grouped.set(sastDate(a.startsAt), [...(grouped.get(sastDate(a.startsAt)) ?? []), a]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Appointments</h1>
          <p className="text-sm text-muted-foreground">
            Times shown in South African Standard Time.
          </p>
        </div>
        {manage && (
          <Button onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Close' : 'Book appointment'}
          </Button>
        )}
      </div>

      <Card>
        <div className="flex flex-wrap items-end gap-3 p-4">
          <Field id="f-practice" label="Practice">
            <Select
              id="f-practice"
              value={activePractice}
              onChange={(e) => {
                setPracticeId(e.target.value);
                setPractitionerId('');
              }}
            >
              {practices.status === 'success' &&
                practices.data.data.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field id="f-prac" label="Practitioner">
            <Select
              id="f-prac"
              value={practitionerId}
              onChange={(e) => setPractitionerId(e.target.value)}
            >
              <option value="">All practitioners</option>
              {practitioners.status === 'success' &&
                practitioners.data.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName}
                  </option>
                ))}
            </Select>
          </Field>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous"
              onClick={() => setDate(addDays(date, -days))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input
              aria-label="Date"
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="w-40"
            />
            <Button
              variant="outline"
              size="icon"
              aria-label="Next"
              onClick={() => setDate(addDays(date, days))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={() => setDate(sastDate(new Date()))}>
              Today
            </Button>
          </div>
          <div role="group" aria-label="View" className="flex gap-1">
            <Button variant={view === 'day' ? 'default' : 'outline'} onClick={() => setView('day')}>
              Day
            </Button>
            <Button
              variant={view === 'week' ? 'default' : 'outline'}
              onClick={() => setView('week')}
            >
              Week
            </Button>
          </div>
        </div>
      </Card>

      {showForm && manage && activePractice && (
        <BookingForm
          practiceId={activePractice}
          defaultDate={date}
          practitioners={practitioners.status === 'success' ? practitioners.data : []}
          onDone={() => {
            setShowForm(false);
            appts.reload();
          }}
        />
      )}

      <Card>
        {appts.status === 'loading' && (
          <div className="space-y-3 p-5" aria-busy="true">
            <span className="sr-only">Loading appointments</span>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}
        {appts.status === 'error' && <ErrorState error={appts.error} onRetry={appts.reload} />}
        {appts.status === 'success' && appts.data.length === 0 && (
          <EmptyState
            title="No appointments"
            description="Nothing is booked in this period for the selected filters."
          />
        )}
        {appts.status === 'success' &&
          [...grouped.entries()].map(([day, list]) => (
            <section key={day} aria-label={formatDay(list[0]!.startsAt)}>
              <h2 className="border-b bg-muted px-5 py-2 text-sm font-semibold">
                {formatDay(list[0]!.startsAt)}
              </h2>
              <ul className="divide-y">
                {list.map((a) => (
                  <AppointmentRow key={a.id} a={a} manage={manage} onAct={act} />
                ))}
              </ul>
            </section>
          ))}
      </Card>
    </div>
  );
}

function AppointmentRow({
  a,
  manage,
  onAct,
}: {
  a: Appointment;
  manage: boolean;
  onAct: (id: string, path: string, body?: object, msg?: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<null | 'reschedule' | 'cancel'>(null);
  const live = a.status === 'SCHEDULED' || a.status === 'CHECKED_IN';
  return (
    <li className="space-y-2 px-5 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">
            {formatTime(a.startsAt)}–{formatTime(a.endsAt)} ·{' '}
            {a.patientName ? (
              <Link className="text-primary underline" href={`/patients/${a.patientId}`}>
                {a.patientName}
              </Link>
            ) : (
              'Patient'
            )}
          </p>
          <p className="text-muted-foreground">
            {a.practitionerName}
            {a.reason ? ` · ${a.reason}` : ''}
            {a.cancelReason ? ` · Cancelled: ${a.cancelReason}` : ''}
          </p>
        </div>
        <Badge tone={TONE[a.status]}>{a.status.replace('_', ' ').toLowerCase()}</Badge>
      </div>
      {manage && live && (
        <div className="flex flex-wrap gap-2">
          {a.status === 'SCHEDULED' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void onAct(a.id, 'status', { status: 'CHECKED_IN' }, 'Patient checked in.')
              }
            >
              Check in
            </Button>
          )}
          {a.status === 'CHECKED_IN' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void onAct(a.id, 'status', { status: 'COMPLETED' }, 'Appointment completed.')
              }
            >
              Complete
            </Button>
          )}
          {a.status === 'SCHEDULED' && new Date(a.startsAt) < new Date() && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void onAct(a.id, 'status', { status: 'NO_SHOW' }, 'Marked as no-show.')
              }
            >
              No-show
            </Button>
          )}
          {a.status === 'SCHEDULED' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setMode(mode === 'reschedule' ? null : 'reschedule')}
            >
              Reschedule
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setMode(mode === 'cancel' ? null : 'cancel')}
          >
            Cancel
          </Button>
        </div>
      )}
      {mode === 'reschedule' && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = formValues(e.currentTarget);
            void onAct(
              a.id,
              'reschedule',
              { startsAt: sastInstant(f.date!, f.time!) },
              'Appointment rescheduled.',
            ).then(() => setMode(null));
          }}
        >
          <Field id={`d-${a.id}`} label="New date">
            <Input
              id={`d-${a.id}`}
              name="date"
              type="date"
              defaultValue={sastDate(a.startsAt)}
              required
            />
          </Field>
          <Field id={`t-${a.id}`} label="New time">
            <Input
              id={`t-${a.id}`}
              name="time"
              type="time"
              defaultValue={formatTime(a.startsAt)}
              required
            />
          </Field>
          <Button size="sm" type="submit">
            Move
          </Button>
        </form>
      )}
      {mode === 'cancel' && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void onAct(
              a.id,
              'cancel',
              { reason: formValues(e.currentTarget).reason },
              'Appointment cancelled.',
            ).then(() => setMode(null));
          }}
        >
          <Field id={`r-${a.id}`} label="Reason for cancelling">
            <Input id={`r-${a.id}`} name="reason" required minLength={2} />
          </Field>
          <Button size="sm" type="submit">
            Confirm cancel
          </Button>
        </form>
      )}
    </li>
  );
}

function BookingForm({
  practiceId,
  defaultDate,
  practitioners,
  onDone,
}: {
  practiceId: string;
  defaultDate: string;
  practitioners: { id: string; displayName: string }[];
  onDone: () => void;
}) {
  const { notify } = useToast();
  const [term, setTerm] = useState('');
  const [patientId, setPatientId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const found = useApi(
    async (s) =>
      term.trim().length >= 2
        ? apiFetch(
            `/patients?q=${encodeURIComponent(term.trim())}&pageSize=8`,
            paginatedSchema(patientSummarySchema),
            { signal: s },
          )
        : null,
    [term],
  );

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = formValues(e.currentTarget);
    const parsed = createAppointmentRequestSchema.safeParse({
      practiceId,
      patientId,
      practitionerUserId: f.practitionerUserId,
      startsAt: sastInstant(f.date!, f.time!),
      durationMinutes: Number(f.durationMinutes),
      reason: f.reason || null,
    });
    if (!parsed.success)
      return setError(
        patientId
          ? parsed.error.issues.map((i) => i.message).join('; ')
          : 'Search for and select a patient first.',
      );
    try {
      await apiFetch('/appointments', appointmentSchema, { method: 'POST', body: parsed.data });
      notify('success', 'Appointment booked.');
      onDone();
    } catch (err) {
      setError(describeError(err));
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Book appointment</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field id="b-patient" label="Patient (search by name, phone or ID)">
              <Input
                id="b-patient"
                value={term}
                onChange={(e) => {
                  setTerm(e.target.value);
                  setPatientId('');
                }}
                autoComplete="off"
              />
            </Field>
            {found.status === 'success' && found.data && !patientId && (
              <ul className="mt-1 divide-y rounded-md border text-sm">
                {found.data.data.length === 0 && (
                  <li className="px-3 py-2 text-muted-foreground">No matching patients.</li>
                )}
                {found.data.data
                  .filter((p) => p.practiceIds.includes(practiceId))
                  .map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-muted"
                        onClick={() => {
                          setPatientId(p.id);
                          setTerm(`${p.lastName}, ${p.firstName}`);
                        }}
                      >
                        {p.lastName}, {p.firstName} · born {p.dateOfBirth}
                      </button>
                    </li>
                  ))}
              </ul>
            )}
            {patientId && <p className="mt-1 text-xs text-success">Patient selected.</p>}
          </div>
          <Field id="b-prac" label="Practitioner">
            <Select id="b-prac" name="practitionerUserId" required>
              {practitioners.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="b-dur" label="Duration">
            <Select id="b-dur" name="durationMinutes" defaultValue="30">
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </Select>
          </Field>
          <Field id="b-date" label="Date">
            <Input id="b-date" name="date" type="date" defaultValue={defaultDate} required />
          </Field>
          <Field id="b-time" label="Time (SAST)">
            <Input id="b-time" name="time" type="time" defaultValue="09:00" required />
          </Field>
          <div className="sm:col-span-2">
            <Field id="b-reason" label="Reason (administrative only)">
              <Input id="b-reason" name="reason" maxLength={200} />
            </Field>
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger sm:col-span-2"
            >
              {error}
            </p>
          )}
          <div className="sm:col-span-2">
            <Button type="submit">Book</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
