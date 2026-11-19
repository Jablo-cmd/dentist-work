import { sanitiseFilename, sniffMime } from './file-signature';

const pad = (head: number[], len = 200) => Buffer.concat([Buffer.from(head), Buffer.alloc(len)]);

describe('sniffMime', () => {
  it('recognises accepted formats by signature', () => {
    expect(sniffMime(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffMime(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(sniffMime(Buffer.from('%PDF-1.7\n...'))).toBe('application/pdf');
    const dicom = Buffer.alloc(200);
    dicom.write('DICM', 128, 'latin1');
    expect(sniffMime(dicom)).toBe('application/dicom');
  });
  it('rejects executables, scripts, archives and empty input regardless of name', () => {
    expect(sniffMime(Buffer.from('MZ\x90\x00'))).toBeNull(); // Windows executable
    expect(sniffMime(Buffer.from('<html><script>alert(1)</script>'))).toBeNull();
    expect(sniffMime(Buffer.from('PK\x03\x04'))).toBeNull(); // zip
    expect(sniffMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffMime(Buffer.alloc(0))).toBeNull();
  });
});

describe('sanitiseFilename', () => {
  it('strips paths, control characters and markup', () => {
    expect(sanitiseFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitiseFilename('C:\\Users\\x\\scan<1>.png')).toBe('scan1.png');
    expect(sanitiseFilename('a\r\nb"; filename=evil.exe')).toBe(
      'ab filename=evil.exe'.replace(';', ''),
    );
  });
  it('falls back for empty or dot-only names and caps length', () => {
    expect(sanitiseFilename('')).toBe('upload');
    expect(sanitiseFilename('...')).toBe('upload');
    expect(sanitiseFilename('x'.repeat(500)).length).toBe(120);
  });
});
