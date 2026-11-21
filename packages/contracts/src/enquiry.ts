import { z } from 'zod';

/** A single line of text: no control characters (blocks header/log injection through names and subjects). */
const oneLine = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    // eslint-disable-next-line no-control-regex
    .regex(/^[^\u0000-\u001f\u007f]+$/, 'must be a single line of plain text');

/** Public enquiry from the sign-in page. Delivered by email to the operator's enquiry inbox. */
export const enquiryRequestSchema = z.object({
  name: oneLine(2, 100),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  organisation: oneLine(1, 120).optional(),
  message: z
    .string()
    .trim()
    .min(10)
    .max(2000)
    // newlines and tabs are fine in the body; other control characters are not
    // eslint-disable-next-line no-control-regex
    .regex(/^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+$/, 'contains unsupported characters'),
  /** Honeypot: a real visitor never sees or fills this field. Non-empty = bot; silently dropped. */
  website: z.string().max(200).optional(),
});
export type EnquiryRequest = z.infer<typeof enquiryRequestSchema>;

export const enquiryResponseSchema = z.object({ received: z.literal(true) });
export type EnquiryResponse = z.infer<typeof enquiryResponseSchema>;
