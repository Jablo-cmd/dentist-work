import { parseCsv } from './csv';
import { parseAndValidate } from './patient-import';

describe('parseCsv', () => {
  it('handles quotes, commas, escaped quotes, CRLF and BOM', () => {
    expect(parseCsv('﻿a,b\r\n"x,1","say ""hi"""\r\n')).toEqual([
      ['a', 'b'],
      ['x,1', 'say "hi"'],
    ]);
  });
  it('skips blank lines and rejects unterminated quotes', () => {
    expect(parseCsv('a\n\n\nb\n')).toEqual([['a'], ['b']]);
    expect(() => parseCsv('a,"b')).toThrow(/Unterminated/);
  });
});

describe('parseAndValidate', () => {
  const head = 'firstName,lastName,dateOfBirth,mobilePhone,idNumber';
  it('requires columns and rejects unknown ones', () => {
    expect(() => parseAndValidate('firstName,lastName\nA,B')).toThrow(/dateOfBirth/);
    expect(() => parseAndValidate(`${head},hobby\nA,B,1990-01-01,,,x`)).toThrow(/Unknown column/);
  });
  it('reports invalid rows by number and field name only, never by value', () => {
    const r = parseAndValidate(
      `${head}\nAnna,Synth,1990-01-01,082 000 0001,\nBad,Synth,1990-02-31,,\nNoPhone,Synth,1991-01-01,abc,`,
    );
    expect(r.report.sourceRows).toBe(3);
    expect(r.report.invalid).toEqual([
      { row: 3, fields: ['dateOfBirth'] },
      { row: 4, fields: ['mobilePhone'] },
    ]);
    expect(JSON.stringify(r.report)).not.toMatch(/Synth|Anna|082/);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.data.mobilePhone).toBe('+27820000001');
  });
  it('flags in-file duplicates and keeps only the first occurrence', () => {
    const r = parseAndValidate(
      `${head}\nAnna,Synth,1990-01-01,,\nA.,SYNTH,1990-01-01,,\nZed,Other,1980-01-01,,8001015009087\nYan,Another,1970-01-01,,8001015009087`,
    );
    expect(r.report.duplicatesInFile).toEqual([
      { row: 3, sameAsRow: 2, reason: 'same surname, first initial and date of birth' },
      { row: 5, sameAsRow: 4, reason: 'same ID number' },
    ]);
    expect(r.rows.map((x) => x.row)).toEqual([2, 4]);
  });
});
