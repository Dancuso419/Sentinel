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

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

// The register and account screens both tell the user "at least 8 characters".
// Enforced here so the promise and the rule are the same fact in one place.
const MIN_PASSWORD_LENGTH = 8;

function isAcceptablePassword(v) {
  return typeof v === 'string' && v.length >= MIN_PASSWORD_LENGTH;
}

module.exports = {
  isValidEmail,
  requireFields,
  isAllowedEvidenceFile,
  isNonEmptyString,
  isAcceptablePassword,
  MIN_PASSWORD_LENGTH,
  MAX_EVIDENCE_BYTES
};
