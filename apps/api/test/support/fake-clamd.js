/* eslint-disable */
// A protocol-faithful stand-in for ClamAV's clamd, used ONLY by tests and the e2e harness so the real
// ClamdScanner client (framing, replies, timeouts) is exercised. It is NOT a malware engine: it flags
// any content containing the marker below. Real detection needs a real clamd (docs/18, docs/20).
const net = require('node:net');

const MALWARE_MARKER = 'FAKE-MALWARE-TEST-MARKER';

/** mode: 'ok' | 'error' (replies ERROR) | 'garbage' | 'slow' (never answers within ms) */
function startFakeClamd(port, opts = {}) {
  const state = { mode: opts.mode ?? 'ok', delayMs: opts.delayMs ?? 0, scans: 0 };
  const server = net.createServer((socket) => {
    let buf = Buffer.alloc(0);
    socket.on('error', () => {});
    socket.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      if (buf.toString('latin1', 0, 5) === 'zPING') {
        socket.end('PONG\0');
        return;
      }
      if (!buf.toString('latin1', 0, 10).startsWith('zINSTREAM\0')) return;
      let off = 10;
      const parts = [];
      for (;;) {
        if (buf.length < off + 4) return; // wait for more
        const len = buf.readUInt32BE(off);
        if (len === 0) break;
        if (buf.length < off + 4 + len) return;
        parts.push(buf.subarray(off + 4, off + 4 + len));
        off += 4 + len;
      }
      state.scans++;
      const content = Buffer.concat(parts);
      const reply = () => {
        if (state.mode === 'error') return socket.end('INSTREAM size limit exceeded. ERROR\0');
        if (state.mode === 'garbage') return socket.end('what?\0');
        if (content.includes(MALWARE_MARKER))
          return socket.end('stream: Fake.Test.Signature FOUND\0');
        socket.end('stream: OK\0');
      };
      if (state.mode === 'slow') return; // hold the connection open: the client must time out
      state.delayMs ? setTimeout(reply, state.delayMs) : reply();
    });
  });
  return new Promise((resolve) =>
    server.listen(port, '127.0.0.1', () =>
      resolve({
        server,
        port: server.address().port,
        state,
        close: () =>
          new Promise((r) => {
            server.close(() => r());
            server.closeAllConnections?.();
          }),
      }),
    ),
  );
}

module.exports = { startFakeClamd, MALWARE_MARKER };
