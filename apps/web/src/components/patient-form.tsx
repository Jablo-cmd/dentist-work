'use client';

import type { Patient, Practice } from '@dpms/contracts';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

/** Shared fields for registering and editing a patient. `practices` is shown only when registering. */
export function PatientFields({
  patient,
  practices,
}: {
  patient?: Patient;
  practices?: Practice[];
}) {
  const v = (k: keyof Patient) => (patient ? ((patient[k] as string | null) ?? '') : '');
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {practices && (
        <Field id="practiceId" label="Registering practice">
          <Select id="practiceId" name="practiceId" required>
            {practices
              .filter((p) => p.isActive)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </Select>
        </Field>
      )}
      <Field id="firstName" label="First name">
        <Input id="firstName" name="firstName" defaultValue={v('firstName')} required />
      </Field>
      <Field id="lastName" label="Surname">
        <Input id="lastName" name="lastName" defaultValue={v('lastName')} required />
      </Field>
      <Field id="preferredName" label="Preferred name">
        <Input id="preferredName" name="preferredName" defaultValue={v('preferredName')} />
      </Field>
      <Field id="dateOfBirth" label="Date of birth">
        <Input
          id="dateOfBirth"
          name="dateOfBirth"
          type="date"
          defaultValue={v('dateOfBirth')}
          required
        />
      </Field>
      <Field id="sex" label="Sex">
        <Select id="sex" name="sex" defaultValue={patient?.sex ?? 'UNSPECIFIED'}>
          <option value="UNSPECIFIED">Not specified</option>
          <option value="FEMALE">Female</option>
          <option value="MALE">Male</option>
          <option value="OTHER">Other</option>
        </Select>
      </Field>
      <Field id="idNumber" label="ID / passport number">
        <Input id="idNumber" name="idNumber" defaultValue={v('idNumber')} autoComplete="off" />
      </Field>
      <Field id="email" label="Email">
        <Input id="email" name="email" type="email" defaultValue={v('email')} />
      </Field>
      <Field id="mobilePhone" label="Mobile number">
        <Input id="mobilePhone" name="mobilePhone" type="tel" defaultValue={v('mobilePhone')} />
      </Field>
      <Field id="homePhone" label="Other phone">
        <Input id="homePhone" name="homePhone" type="tel" defaultValue={v('homePhone')} />
      </Field>
      <Field id="addressLine1" label="Address line 1">
        <Input id="addressLine1" name="addressLine1" defaultValue={v('addressLine1')} />
      </Field>
      <Field id="addressLine2" label="Address line 2">
        <Input id="addressLine2" name="addressLine2" defaultValue={v('addressLine2')} />
      </Field>
      <Field id="suburb" label="Suburb">
        <Input id="suburb" name="suburb" defaultValue={v('suburb')} />
      </Field>
      <Field id="city" label="City">
        <Input id="city" name="city" defaultValue={v('city')} />
      </Field>
      <Field id="postalCode" label="Postal code">
        <Input id="postalCode" name="postalCode" defaultValue={v('postalCode')} />
      </Field>
    </div>
  );
}
