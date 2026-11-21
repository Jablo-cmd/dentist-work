import { createTransport } from 'nodemailer';
import { SmtpMailer } from './smtp-mailer';

const smtp = {
  host: 'smtp.example.invalid',
  port: 465,
  secure: true,
  user: 'sender@example.invalid',
  password: 'unused',
  from: 'enquiries@example.invalid',
};

async function sendWith(overrides: Partial<Parameters<SmtpMailer['send']>[0]> = {}) {
  // jsonTransport renders the message instead of delivering it, so no network is involved.
  const transport = createTransport({ jsonTransport: true });
  const mailer = new SmtpMailer(smtp, 'info@aurisnexus.co.za', transport);
  let captured: { message: string } | undefined;
  const real = transport.sendMail.bind(transport);
  transport.sendMail = (async (m: Parameters<typeof real>[0]) =>
    (captured = (await real(m)) as never)) as never;
  await mailer.send(
    {
      name: 'Visitor Name',
      email: 'visitor@example.invalid',
      organisation: 'Synthetic Dental',
      message: 'Hello, we would like a demonstration please.',
      ...overrides,
    },
    { requestId: 'req-123' },
  );
  return JSON.parse(captured!.message) as {
    to: { address: string }[];
    from: { address: string; name: string };
    replyTo: { address: string }[];
    subject: string;
    text: string;
  };
}

describe('SmtpMailer', () => {
  it('always delivers to the configured inbox, from the configured sender, with the visitor as Reply-To', async () => {
    const m = await sendWith();
    expect(m.to.map((a) => a.address)).toEqual(['info@aurisnexus.co.za']);
    expect(m.from.address).toBe('enquiries@example.invalid');
    expect(m.replyTo.map((a) => a.address)).toEqual(['visitor@example.invalid']);
    expect(m.subject).toBe('Nexus enquiry from Visitor Name');
    expect(m.text).toContain('Reference: req-123');
    expect(m.text).toContain('we would like a demonstration');
  });

  it('never lets the visitor become the sender or a recipient', async () => {
    const m = await sendWith({ email: 'someone.else@example.invalid' });
    expect(m.from.address).not.toBe('someone.else@example.invalid');
    expect(m.to.some((a) => a.address === 'someone.else@example.invalid')).toBe(false);
  });
});
