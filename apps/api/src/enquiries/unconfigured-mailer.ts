import type { EnquiryMailer } from './enquiry-mailer';

/** Used when no SMTP account is configured. The service reports "unavailable" instead of pretending to send. */
export class UnconfiguredMailer implements EnquiryMailer {
  readonly configured = false;
  send(): Promise<void> {
    return Promise.reject(new Error('enquiry email is not configured'));
  }
}
