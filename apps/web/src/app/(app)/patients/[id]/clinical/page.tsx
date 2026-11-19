'use client';

import {
  ITEM_TRANSITIONS,
  TOOTH_CONDITIONS,
  TOOTH_SURFACES,
  addChartEntryRequestSchema,
  chartEntrySchema,
  createTreatmentPlanRequestSchema,
  encounterSchema,
  encounterSummarySchema,
  imagingAssetSchema,
  IMAGING_MODALITIES,
  paginatedSchema,
  practiceSchema,
  treatmentPlanSchema,
  type ChartEntry,
  type Encounter,
  type EncounterSummary,
  type TreatmentPlan,
} from '@dpms/contracts';
import Link from 'next/link';
import { useParams } from 'next/navigation';
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
import { formatDay, formatTime } from '@/lib/time';
import { useApi } from '@/lib/use-api';

const UPPER = [
  '18',
  '17',
  '16',
  '15',
  '14',
  '13',
  '12',
  '11',
  '21',
  '22',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28',
];
const LOWER = [
  '48',
  '47',
  '46',
  '45',
  '44',
  '43',
  '42',
  '41',
  '31',
  '32',
  '33',
  '34',
  '35',
  '36',
  '37',
  '38',
];
const human = (s: string) => s.toLowerCase().replace(/_/g, ' ');
const stamp = (iso: string) => `${formatDay(iso)} ${formatTime(iso)}`;

export default function ClinicalPage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useSession();
  if (state.status !== 'authenticated') return null;
  if (!can(state.user, 'clinical_record.read'))
    return (
      <Card>
        <EmptyState
          title="Not available"
          description="Your role does not include access to clinical records."
        />
      </Card>
    );
  return (
    <div className="space-y-4">
      <div>
        <Link href={`/patients/${id}`} className="text-sm text-primary underline">
          ← Patient details
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Clinical record</h1>
        <p className="text-sm text-muted-foreground">
          Every view and change is audited. Finalised notes can only be amended or added to; nothing
          is overwritten.
        </p>
      </div>
      <Encounters patientId={id} />
      <Chart patientId={id} />
      <Plans patientId={id} />
      {can(state.user, 'imaging.view') && <Imaging patientId={id} />}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
function Encounters({ patientId }: { patientId: string }) {
  const { state } = useSession();
  const { notify } = useToast();
  const list = useApi(
    (s) =>
      apiFetch(`/patients/${patientId}/encounters`, z.array(encounterSummarySchema), { signal: s }),
    [patientId],
  );
  const practices = useApi((s) =>
    apiFetch('/practices?pageSize=100', paginatedSchema(practiceSchema), { signal: s }),
  );
  const [openId, setOpenId] = useState<string | null>(null);
  if (state.status !== 'authenticated') return null;

  async function start(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = formValues(e.currentTarget);
    try {
      const enc = await apiFetch(`/patients/${patientId}/encounters`, encounterSchema, {
        method: 'POST',
        body: { practiceId: f.practiceId },
      });
      list.reload();
      setOpenId(enc.id);
    } catch (err) {
      notify('error', describeError(err));
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Encounters and clinical notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {can(state.user, 'clinical_record.create') && practices.status === 'success' && (
          <form onSubmit={start} className="flex flex-wrap items-end gap-2">
            <Field id="enc-practice" label="Practice">
              <Select id="enc-practice" name="practiceId">
                {practices.data.data
                  .filter((p) => p.isActive)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Button type="submit">Start new encounter</Button>
          </form>
        )}
        {list.status === 'loading' && <Skeleton className="h-16 w-full" />}
        {list.status === 'error' && <ErrorState error={list.error} onRetry={list.reload} />}
        {list.status === 'success' && list.data.length === 0 && (
          <p className="text-sm text-muted-foreground">No encounters recorded.</p>
        )}
        {list.status === 'success' && (
          <ul className="divide-y rounded-md border">
            {list.data.map((e: EncounterSummary) => (
              <li key={e.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-muted"
                  aria-expanded={openId === e.id}
                  onClick={() => setOpenId(openId === e.id ? null : e.id)}
                >
                  <span>
                    {stamp(e.encounteredAt)} · {e.practitionerName}
                  </span>
                  <Badge tone={e.status === 'FINALISED' ? 'success' : 'warning'}>
                    {e.status.toLowerCase()}
                  </Badge>
                </button>
                {openId === e.id && <EncounterDetail id={e.id} onChanged={list.reload} />}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function EncounterDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const { state } = useSession();
  const { notify } = useToast();
  const enc = useApi((s) => apiFetch(`/encounters/${id}`, encounterSchema, { signal: s }), [id]);
  if (state.status !== 'authenticated') return null;
  const user = state.user;
  if (enc.status === 'loading')
    return (
      <div className="p-4">
        <Skeleton className="h-24 w-full" />
      </div>
    );
  if (enc.status === 'error') return <ErrorState error={enc.error} onRetry={enc.reload} />;
  const e: Encounter = enc.data;
  const mine = e.practitionerUserId === user.id;

  async function call(
    path: string,
    method: 'PUT' | 'POST',
    body: object | undefined,
    ok: string,
    form?: HTMLFormElement,
  ) {
    try {
      await apiFetch(`/encounters/${id}/${path}`, encounterSchema, { method, body: body ?? {} });
      notify('success', ok);
      form?.reset();
      enc.reload();
      onChanged();
    } catch (err) {
      notify('error', describeError(err));
    }
  }
  const save = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    void call('draft', 'PUT', { body: formValues(ev.currentTarget).body }, 'Draft saved.');
  };
  return (
    <div className="space-y-4 border-t bg-muted/40 p-4 text-sm">
      {e.status === 'DRAFT' && mine && can(user, 'clinical_record.create') ? (
        <form onSubmit={save} className="space-y-2">
          <Field id={`body-${id}`} label="Clinical note (draft — every save is kept as a version)">
            <textarea
              id={`body-${id}`}
              name="body"
              defaultValue={e.currentBody}
              rows={8}
              required
              maxLength={20000}
              className="w-full rounded-md border bg-card p-3 text-sm"
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" variant="outline" size="sm">
              Save draft
            </Button>
            {can(user, 'clinical_record.finalise') && e.currentBody && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  if (
                    window.confirm(
                      'Finalise this record? It can no longer be edited, only amended.',
                    )
                  )
                    void call('finalise', 'POST', undefined, 'Record finalised.');
                }}
              >
                Finalise
              </Button>
            )}
          </div>
        </form>
      ) : (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">
            {e.status === 'DRAFT'
              ? 'Draft — only the author can edit'
              : `Finalised ${stamp(e.finalisedAt!)}`}
          </p>
          <p className="whitespace-pre-wrap rounded-md border bg-card p-3">
            {e.currentBody || '—'}
          </p>
        </div>
      )}

      {e.status === 'FINALISED' && can(user, 'clinical_record.amend') && (
        <div className="grid gap-4 md:grid-cols-2">
          <form
            className="space-y-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              const f = formValues(ev.currentTarget);
              void call(
                'amendments',
                'POST',
                { body: f.body, reason: f.reason },
                'Amendment recorded.',
                ev.currentTarget,
              );
            }}
          >
            <h3 className="font-semibold">Amend (correct the note)</h3>
            <Field id={`ab-${id}`} label="Corrected note">
              <textarea
                id={`ab-${id}`}
                name="body"
                defaultValue={e.currentBody}
                rows={5}
                required
                className="w-full rounded-md border bg-card p-2"
              />
            </Field>
            <Field id={`ar-${id}`} label="Reason for amendment (kept permanently)">
              <Input id={`ar-${id}`} name="reason" required minLength={5} />
            </Field>
            <Button type="submit" size="sm" variant="outline">
              Record amendment
            </Button>
          </form>
          <form
            className="space-y-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              void call(
                'addenda',
                'POST',
                { body: formValues(ev.currentTarget).body },
                'Addendum added.',
                ev.currentTarget,
              );
            }}
          >
            <h3 className="font-semibold">Add addendum (extra information)</h3>
            <Field id={`ad-${id}`} label="Addendum">
              <textarea
                id={`ad-${id}`}
                name="body"
                rows={5}
                required
                className="w-full rounded-md border bg-card p-2"
              />
            </Field>
            <Button type="submit" size="sm" variant="outline">
              Add addendum
            </Button>
          </form>
        </div>
      )}

      <details>
        <summary className="cursor-pointer font-medium">
          Version history ({e.versions.length})
        </summary>
        <ol className="mt-2 space-y-2">
          {e.versions.map((v) => (
            <li key={v.versionNumber} className="rounded-md border bg-card p-3">
              <p className="text-xs text-muted-foreground">
                v{v.versionNumber} · {human(v.kind)}
                {v.amendsVersion ? ` of v${v.amendsVersion}` : ''} · {v.authorName} ·{' '}
                {stamp(v.createdAt)}
              </p>
              {v.reason && <p className="text-xs font-medium">Reason: {v.reason}</p>}
              <p className="mt-1 whitespace-pre-wrap">{v.body}</p>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
function Chart({ patientId }: { patientId: string }) {
  const { state } = useSession();
  const { notify } = useToast();
  const chart = useApi(
    (s) => apiFetch(`/patients/${patientId}/chart`, z.array(chartEntrySchema), { signal: s }),
    [patientId],
  );
  const [tooth, setTooth] = useState('');
  if (state.status !== 'authenticated') return null;
  const canEdit = can(state.user, 'clinical_record.create');
  const active = chart.status === 'success' ? chart.data.filter((c) => !c.resolvedAt) : [];
  const byTooth = (t: string) => active.filter((c) => c.toothNumber === t);

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const parsed = addChartEntryRequestSchema.safeParse({
      toothNumber: f.get('toothNumber'),
      condition: f.get('condition'),
      surfaces: f.getAll('surfaces'),
      note: f.get('note') || null,
    });
    if (!parsed.success)
      return notify('error', parsed.error.issues.map((i) => i.message).join('; '));
    try {
      await apiFetch(`/patients/${patientId}/chart`, chartEntrySchema, {
        method: 'POST',
        body: parsed.data,
      });
      form.reset();
      setTooth('');
      chart.reload();
    } catch (err) {
      notify('error', describeError(err));
    }
  }
  const row = (teeth: string[]) => (
    <div className="flex flex-wrap justify-center gap-1">
      {teeth.map((t) => {
        const n = byTooth(t).length;
        return (
          <button
            key={t}
            type="button"
            onClick={() => setTooth(t)}
            aria-label={`Tooth ${t}${n ? `, ${n} active finding${n > 1 ? 's' : ''}` : ''}`}
            aria-pressed={tooth === t}
            className={`h-10 w-9 rounded-md border text-xs font-medium ${tooth === t ? 'border-primary bg-primary text-primary-foreground' : n ? 'border-warning bg-warning-soft text-warning' : 'bg-card hover:bg-muted'}`}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dental chart (FDI notation)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2" role="group" aria-label="Tooth selector">
          {row(UPPER)}
          {row(LOWER)}
          <p className="text-center text-xs text-muted-foreground">
            Highlighted teeth have active findings. Notation is a working default pending client
            confirmation.
          </p>
        </div>
        {canEdit && (
          <form onSubmit={add} className="grid gap-3 border-t pt-4 sm:grid-cols-2">
            <Field id="ch-tooth" label="Tooth (FDI)">
              <Input
                id="ch-tooth"
                name="toothNumber"
                value={tooth}
                onChange={(e) => setTooth(e.target.value)}
                placeholder="e.g. 26"
                required
              />
            </Field>
            <Field id="ch-cond" label="Finding">
              <Select id="ch-cond" name="condition">
                {TOOTH_CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {human(c)}
                  </option>
                ))}
              </Select>
            </Field>
            <fieldset className="sm:col-span-2">
              <legend className="mb-1 text-sm font-medium">Surfaces</legend>
              <div className="flex flex-wrap gap-3 text-sm">
                {TOOTH_SURFACES.map((s) => (
                  <label key={s} className="flex items-center gap-1">
                    <input type="checkbox" name="surfaces" value={s} /> {human(s)}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="sm:col-span-2">
              <Field id="ch-note" label="Note">
                <Input id="ch-note" name="note" maxLength={500} />
              </Field>
            </div>
            <div>
              <Button type="submit" size="sm">
                Add finding
              </Button>
            </div>
          </form>
        )}
        {chart.status === 'error' && <ErrorState error={chart.error} onRetry={chart.reload} />}
        {chart.status === 'success' && (
          <ul className="divide-y text-sm">
            {chart.data.length === 0 && (
              <li className="py-2 text-muted-foreground">No findings recorded.</li>
            )}
            {chart.data.map((c: ChartEntry) => (
              <li
                key={c.id}
                className={`flex items-center justify-between gap-2 py-2 ${c.resolvedAt ? 'opacity-60' : ''}`}
              >
                <span>
                  <span className="font-medium">Tooth {c.toothNumber}</span> · {human(c.condition)}
                  {c.surfaces.length ? ` (${c.surfaces.map(human).join(', ')})` : ''}
                  {c.note ? ` — ${c.note}` : ''}{' '}
                  <span className="text-muted-foreground">· {stamp(c.recordedAt)}</span>{' '}
                  {c.resolvedAt && <Badge>resolved</Badge>}
                </span>
                {canEdit && !c.resolvedAt && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void apiFetch(
                        `/patients/${patientId}/chart/${c.id}/resolve`,
                        chartEntrySchema,
                        { method: 'POST', body: {} },
                      ).then(chart.reload, (e) => notify('error', describeError(e)))
                    }
                  >
                    Resolve
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
function Plans({ patientId }: { patientId: string }) {
  const { state } = useSession();
  const { notify } = useToast();
  const plans = useApi(
    (s) =>
      apiFetch(`/patients/${patientId}/treatment-plans`, z.array(treatmentPlanSchema), {
        signal: s,
      }),
    [patientId],
  );
  const practices = useApi((s) =>
    apiFetch('/practices?pageSize=100', paginatedSchema(practiceSchema), { signal: s }),
  );
  if (state.status !== 'authenticated') return null;
  const canEdit = can(state.user, 'clinical_record.create');

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = formValues(form);
    const parsed = createTreatmentPlanRequestSchema.safeParse({
      practiceId: f.practiceId,
      title: f.title,
      items: [
        {
          toothNumber: f.toothNumber || null,
          description: f.description,
          estimatedAmount: f.estimatedAmount || null,
        },
      ],
    });
    if (!parsed.success)
      return notify(
        'error',
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    try {
      await apiFetch(`/patients/${patientId}/treatment-plans`, treatmentPlanSchema, {
        method: 'POST',
        body: parsed.data,
      });
      form.reset();
      plans.reload();
    } catch (err) {
      notify('error', describeError(err));
    }
  }
  async function move(itemId: string, status: string) {
    try {
      await apiFetch(`/treatment-plans/items/${itemId}/status`, treatmentPlanSchema, {
        method: 'POST',
        body: { status },
      });
      plans.reload();
    } catch (err) {
      notify('error', describeError(err));
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Treatment plans</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {plans.status === 'error' && <ErrorState error={plans.error} onRetry={plans.reload} />}
        {plans.status === 'success' && plans.data.length === 0 && (
          <p className="text-sm text-muted-foreground">No treatment plans.</p>
        )}
        {plans.status === 'success' &&
          plans.data.map((pl: TreatmentPlan) => (
            <section key={pl.id} className="rounded-md border" aria-label={pl.title}>
              <h3 className="border-b bg-muted px-4 py-2 text-sm font-semibold">
                {pl.title}{' '}
                <span className="font-normal text-muted-foreground">· {stamp(pl.createdAt)}</span>
              </h3>
              <ul className="divide-y text-sm">
                {pl.items.map((i) => (
                  <li key={i.id} className="space-y-1 px-4 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        {i.toothNumber ? `Tooth ${i.toothNumber}: ` : ''}
                        {i.description}
                        {i.estimatedAmount ? ` · est. R${i.estimatedAmount}` : ''}
                      </span>
                      <Badge
                        tone={
                          i.status === 'COMPLETED'
                            ? 'success'
                            : i.status === 'DECLINED'
                              ? 'danger'
                              : i.status === 'ACCEPTED'
                                ? 'warning'
                                : 'neutral'
                        }
                      >
                        {human(i.status)}
                      </Badge>
                    </div>
                    {canEdit && ITEM_TRANSITIONS[i.status].length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {ITEM_TRANSITIONS[i.status].map((s) => (
                          <Button
                            key={s}
                            size="sm"
                            variant="outline"
                            onClick={() => void move(i.id, s)}
                          >
                            {human(s)}
                          </Button>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        {canEdit && practices.status === 'success' && (
          <form onSubmit={create} className="grid gap-3 border-t pt-4 sm:grid-cols-2">
            <h3 className="text-sm font-semibold sm:col-span-2">New treatment plan</h3>
            <Field id="tp-practice" label="Practice">
              <Select id="tp-practice" name="practiceId">
                {practices.data.data
                  .filter((p) => p.isActive)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field id="tp-title" label="Plan title">
              <Input id="tp-title" name="title" required />
            </Field>
            <Field id="tp-tooth" label="Tooth (optional)">
              <Input id="tp-tooth" name="toothNumber" />
            </Field>
            <Field id="tp-amount" label="Estimated amount, rand (optional)">
              <Input
                id="tp-amount"
                name="estimatedAmount"
                inputMode="decimal"
                placeholder="1500.00"
              />
            </Field>
            <div className="sm:col-span-2">
              <Field id="tp-desc" label="First item">
                <Input id="tp-desc" name="description" required />
              </Field>
            </div>
            <div>
              <Button type="submit" size="sm">
                Create plan
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
function Imaging({ patientId }: { patientId: string }) {
  const { state } = useSession();
  const { notify } = useToast();
  const assets = useApi(
    (s) => apiFetch(`/patients/${patientId}/imaging`, z.array(imagingAssetSchema), { signal: s }),
    [patientId],
  );
  const practices = useApi((s) =>
    apiFetch('/practices?pageSize=100', paginatedSchema(practiceSchema), { signal: s }),
  );
  const [busy, setBusy] = useState(false);
  if (state.status !== 'authenticated') return null;

  async function rescan(id: string) {
    try {
      await apiFetch(`/imaging/${id}/rescan`, imagingAssetSchema, { method: 'POST', body: {} });
      assets.reload();
    } catch (err) {
      notify('error', describeError(err));
    }
  }

  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    try {
      await apiFetch(`/patients/${patientId}/imaging`, imagingAssetSchema, {
        method: 'POST',
        body: new FormData(form),
      });
      notify('success', 'File uploaded.');
      form.reset();
      assets.reload();
    } catch (err) {
      notify('error', describeError(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Imaging and documents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Accepted: JPEG, PNG, PDF, DICOM (checked by file content, max 25 MB). Every upload is held
          in quarantine until it passes a malware scan; files that fail or cannot be scanned stay
          unavailable. Every view and download is audited and re-checked against your permissions.
        </p>
        {assets.status === 'error' && <ErrorState error={assets.error} onRetry={assets.reload} />}
        {assets.status === 'success' && (
          <ul className="divide-y text-sm">
            {assets.data.length === 0 && (
              <li className="py-2 text-muted-foreground">No files stored.</li>
            )}
            {assets.data.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{a.originalFilename}</span> · {human(a.modality)} ·{' '}
                  {(a.sizeBytes / 1024).toFixed(0)} KB · {stamp(a.uploadedAt)}
                </span>
                {a.available ? (
                  <a
                    className="text-primary underline"
                    href={`/api/v1/imaging/${a.id}/file`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {a.mimeType.startsWith('image/') ? 'View' : 'Download'}
                  </a>
                ) : (
                  <span className="flex items-center gap-2">
                    <Badge tone={a.scanStatus === 'INFECTED' ? 'danger' : 'warning'}>
                      {a.scanStatus === 'INFECTED'
                        ? 'quarantined'
                        : a.scanStatus === 'SCAN_FAILED'
                          ? 'scan failed'
                          : 'awaiting scan'}
                    </Badge>
                    {(a.scanStatus === 'PENDING' || a.scanStatus === 'SCAN_FAILED') &&
                      can(state.user, 'imaging.upload') && (
                        <Button size="sm" variant="outline" onClick={() => void rescan(a.id)}>
                          Retry scan
                        </Button>
                      )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {can(state.user, 'imaging.upload') && practices.status === 'success' && (
          <form onSubmit={upload} className="grid gap-3 border-t pt-4 sm:grid-cols-2">
            <Field id="im-file" label="File">
              <Input
                id="im-file"
                name="file"
                type="file"
                accept="image/jpeg,image/png,application/pdf,.dcm"
                required
              />
            </Field>
            <Field id="im-mod" label="Type">
              <Select id="im-mod" name="modality">
                {IMAGING_MODALITIES.map((m) => (
                  <option key={m} value={m}>
                    {human(m)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="im-prac" label="Practice">
              <Select id="im-prac" name="practiceId">
                {practices.data.data
                  .filter((p) => p.isActive)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <div className="flex items-end">
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? 'Uploading…' : 'Upload'}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
