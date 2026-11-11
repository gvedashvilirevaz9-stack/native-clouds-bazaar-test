// Country is a search preference, never an authentication or entitlement signal.
export function countryCode(value) {
 return typeof value==='string' && /^[A-Z]{2}$/.test(value) && !['XX','T1'].includes(value) ? value : null;
}
export function traceCountry(text) {
 return typeof text==='string' ? countryCode(text.match(/^loc=([A-Z]{2})\r?$/m)?.[1]) : null;
}
