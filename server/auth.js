const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Fail-fast in production if secrets are not configured
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET env var is required in production');
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET || 'mahana-jwt-secret-2026-change-in-prod';
const JWT_EXPIRES = '7d';

// ── Password helpers ──

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

// ── JWT helpers ──

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, rol: user.rol, vendedor: user.vendedor, nombre: user.nombre },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

function decodeToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// ── Middleware: require authenticated user ──

function requireAuth(req, res, next) {
  // Also accept API key for backward compatibility (OpenClaw, etc.)
  const apiKey = req.headers['x-api-key'];
  if (apiKey && apiKey === (process.env.API_KEY || 'mahana-dev-key-2026')) {
    req.user = { id: 0, email: 'api', rol: 'admin', vendedor: null, nombre: 'API' };
    return next();
  }

  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Token de autenticación requerido' }
    });
  }

  const decoded = decodeToken(auth.slice(7));
  if (!decoded) {
    return res.status(401).json({
      success: false,
      error: { code: 'TOKEN_EXPIRED', message: 'Token inválido o expirado' }
    });
  }

  req.user = decoded;
  next();
}

// ── Middleware: require specific role ──

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'No autenticado' }
      });
    }
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'No tienes permisos para esta acción' }
      });
    }
    next();
  };
}

// ── Helper: is partner? ──

function isPartner(req) {
  return req.user && req.user.rol === 'partner';
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  decodeToken,
  requireAuth,
  requireRole,
  isPartner
};
