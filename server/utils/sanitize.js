function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>"'`;]/g, '').replace(/\\+/g, '').trim();
}

module.exports = { sanitize };
