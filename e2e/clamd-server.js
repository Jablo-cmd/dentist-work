// Test-only stand-in for ClamAV's clamd (see apps/api/test/support/fake-clamd.js). Flags content that
// contains the fake-malware marker; it is NOT a malware engine.
const { startFakeClamd } = require('../apps/api/test/support/fake-clamd.js');
startFakeClamd(4575);
