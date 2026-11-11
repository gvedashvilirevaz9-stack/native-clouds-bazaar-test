// One serverless function for the outside services paid with the person's wallet (Vercel Hobby allows 12 functions).
//   /api/x/bitrefill?op=…   /api/x/travala?op=…
import bitrefill from '../_lib/bitrefill.mjs';
import travala from '../_lib/travala.mjs';
import cabin from '../_lib/cabin.mjs';
const SVC = {bitrefill, travala, cabin};
export default function handler(req, res) {
  const h = SVC[String(req.query?.svc || '')]; if (!h) return res.status(404).json({error: 'UNKNOWN_SERVICE'});
  return h(req, res);
}
