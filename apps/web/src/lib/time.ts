/** All user-facing times are Africa/Johannesburg (UTC+2, no daylight saving). Storage and API use UTC instants. */
export const TZ = 'Africa/Johannesburg';

const timeFmt = new Intl.DateTimeFormat('en-ZA', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const dayFmt = new Intl.DateTimeFormat('en-ZA', {
  timeZone: TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const ymdFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export const formatTime = (iso: string): string => timeFmt.format(new Date(iso));
export const formatDay = (iso: string): string => dayFmt.format(new Date(iso));
/** YYYY-MM-DD of an instant in SAST. */
export const sastDate = (d: Date | string): string =>
  ymdFmt.format(typeof d === 'string' ? new Date(d) : d);
/** SAST wall-clock date + time → ISO instant with explicit offset. */
export const sastInstant = (date: string, time: string): string => `${date}T${time}:00+02:00`;
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00+02:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return sastDate(d);
}
