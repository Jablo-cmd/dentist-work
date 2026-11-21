import { createTransport, type Transporter } from 'nodemailer';
import type { Env } from '../config/env';
import type { EnquiryMailer } from './enquiry-mailer';

type Smtp = NonNullable<Env['smtp']>;

/**
 * Sends the enquiry over authenticated SMTP. The recipient is fixed by configuration; the visitor's address is
 * used only as Reply-To (never as From or To), so the endpoint cannot be used to mail arbitrary people.
 * TLS is always required: implicit TLS, or STARTTLS that must succeed (no plaintext fallback).
 */
export class SmtpMailer implements EnquiryMailer {
  readonly configured = true;
  private readonly transport: Transporter;
  constructor(
    private readonly smtp: Smtp,
    private readonly to: string,
    transport?: Transporter,
  ) {
    this.transport =
      transport ??
      createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        requireTLS: !smtp.secure,
        auth: { user: smtp.user, pass: smtp.password },
        connectionTimeout: 8_000,
        greetingTimeout: 8_000,
        socketTimeout: 12_000,
      });
  }

  async send(
    e: { name: string; email: string; organisation?: string; message: string },
    meta: { requestId: string },
  ): Promise<void> {
    const text = [
      `New enquiry from the Nexus Dental Practice Management System sign-in page`,
      '',
      `Name:         ${e.name}`,
      `Email:        ${e.email}`,
      `Organisation: ${e.organisation ?? '(not given)'}`,
      '',
      'Message:',
      e.message,
      '',
      `Reference: ${meta.requestId}`,
    ].join('\n');
    await this.transport.sendMail({
      from: { name: 'Nexus enquiries', address: this.smtp.from },
      to: this.to,
      replyTo: { name: e.name, address: e.email },
      subject: `Nexus enquiry from ${e.name}`,
      text,
    });
  }
}
