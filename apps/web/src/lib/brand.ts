/** Official brand strings (single source). Do not add alternative names or slogans. */
export const BRAND = {
  /** Short mark shown above the descriptor in the lockup (sidebar, sign-in). */
  name: 'Nexus',
  description: 'Dental Practice Management System',
  /** The full product name: browser title, footer, authenticator label, API docs. */
  fullName: 'Nexus Dental Practice Management System',
  punchline: 'Better care. Smarter practice.',
  /** Where prospective customers are sent to enquire (Auris Nexus Technologies). */
  enquiryEmail: 'info@aurisnexus.co.za',
} as const;

export const ROLE_LABEL: Record<string, string> = {
  ORGANISATION_OWNER: 'Organisation Owner',
  PRACTICE_ADMINISTRATOR: 'Practice Administrator',
  DENTIST: 'Dentist / Practitioner',
  RECEPTIONIST: 'Receptionist',
  BILLING_ADMINISTRATOR: 'Billing Administrator',
};
