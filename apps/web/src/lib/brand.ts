/** Official brand strings (single source). Do not add alternative names or slogans. */
export const BRAND = {
  name: 'MultiDentalPractice System',
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
