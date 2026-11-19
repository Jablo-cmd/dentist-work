/** Reads a form into a plain object of strings (empty inputs stay as ''; the contracts treat '' as null). */
export function formValues(form: HTMLFormElement): Record<string, string> {
  const out: Record<string, string> = {};
  new FormData(form).forEach((v, k) => {
    if (typeof v === 'string') out[k] = v;
  });
  return out;
}
