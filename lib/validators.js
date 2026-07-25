const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

function isValidEmail(str) {
  return typeof str === 'string' && EMAIL_RE.test(str);
}

function requireFields(obj, fieldNames) {
  return fieldNames.filter((f) => {
    const v = obj[f];
    return v === undefined || v === null || String(v).trim() === '';
  });
}

function isAllowedEvidenceFile(mimetype, sizeBytes) {
  return ALLOWED_MIME.has(mimetype) && sizeBytes <= MAX_EVIDENCE_BYTES;
}

module.exports = { isValidEmail, requireFields, isAllowedEvidenceFile, MAX_EVIDENCE_BYTES };
