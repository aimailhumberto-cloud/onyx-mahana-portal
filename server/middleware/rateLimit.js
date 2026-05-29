const { error } = require('./response');

const requestCounts = {};
const RATE_LIMIT = 200;
const RATE_WINDOW = 60 * 1000;

function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  if (!requestCounts[ip]) {
    requestCounts[ip] = { count: 1, startTime: now };
  } else if (now - requestCounts[ip].startTime > RATE_WINDOW) {
    requestCounts[ip] = { count: 1, startTime: now };
  } else {
    requestCounts[ip].count++;
    if (requestCounts[ip].count > RATE_LIMIT) {
      return error(res, 'RATE_LIMIT', 'Too many requests. Limit: 200/min', 429);
    }
  }
  next();
}

// Cleanup stale rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const ip of Object.keys(requestCounts)) {
    if (now - requestCounts[ip].startTime > RATE_WINDOW) {
      delete requestCounts[ip];
    }
  }
}, 5 * 60 * 1000);

module.exports = { rateLimiter };
