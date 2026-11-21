import type { EnquiryRequest } from '@dpms/contracts';

/** Port for delivering an enquiry to the operator's inbox. Implementations never choose the recipient from input. */
export interface EnquiryMailer {
  readonly configured: boolean;
  send(enquiry: Omit<EnquiryRequest, 'website'>, meta: { requestId: string }): Promise<void>;
}
export const ENQUIRY_MAILER = Symbol('ENQUIRY_MAILER');
