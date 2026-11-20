// Vercel Function entry: delegates to the compiled NestJS handler (built by `nest build` into dist/).
module.exports = require('../dist/serverless').default;
