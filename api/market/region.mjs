// Same answer as the local server: no geolocation in this build.
export default function handler(req, res) { res.status(200).json({countryCode: null, source: 'vercel', note: 'Geolocation is not included.'}); }
