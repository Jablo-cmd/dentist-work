/** Official Noordwyk DPS brand strings. Do not alter or add alternatives (brand directive). */
export const BRAND = {
  name: 'NOORDWYK DPS',
  description: 'Dental Practice Management System',
  punchline: 'Better care. Smarter practice.',
} as const;

export const ROLE_LABEL: Record<string, string> = {
  ORGANISATION_OWNER: 'Organisation Owner',
  PRACTICE_ADMINISTRATOR: 'Practice Administrator',
  DENTIST: 'Dentist / Practitioner',
  RECEPTIONIST: 'Receptionist',
  BILLING_ADMINISTRATOR: 'Billing Administrator',
};
