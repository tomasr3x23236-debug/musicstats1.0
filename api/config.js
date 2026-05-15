// api/config.js — Vercel Serverless Function
// Sirve el Developer Token de Apple Music de forma segura
// El token NUNCA se expone en el código del cliente

const jwt = require('jsonwebtoken');

// Cache del token (se regenera antes de expirar)
let cachedToken = null;
let tokenExpiry = 0;

function generateDeveloperToken() {
  const now = Math.floor(Date.now() / 1000);

  // Regenerar si faltan menos de 10 minutos
  if (cachedToken && tokenExpiry - now > 600) {
    return cachedToken;
  }

  const keyId     = process.env.APPLE_KEY_ID;          // Tu Key ID de Apple
  const teamId    = process.env.APPLE_TEAM_ID;          // Tu Team ID de Apple
  const privateKey = process.env.APPLE_PRIVATE_KEY;     // Tu clave privada .p8

  // Si no hay variables, retornar null (modo demo)
  if (!keyId || !teamId || !privateKey) {
    return null;
  }

  // Formatear la clave privada (Vercel escapa los saltos de línea)
  const formattedKey = privateKey.replace(/\\n/g, '\n');

  const expiresIn = 15777000; // ~6 meses (máximo Apple)
  tokenExpiry = now + expiresIn;

  cachedToken = jwt.sign({}, formattedKey, {
    algorithm: 'ES256',
    expiresIn,
    issuer: teamId,
    header: { alg: 'ES256', kid: keyId }
  });

  return cachedToken;
}

module.exports = (req, res) => {
  // CORS para desarrollo local
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=3600');

  try {
    const token = generateDeveloperToken();
    res.status(200).json({
      developerToken: token,
      configured: !!token,
      timestamp: Date.now()
    });
  } catch (err) {
    console.error('Token generation error:', err.message);
    res.status(200).json({
      developerToken: null,
      configured: false,
      error: 'Token generation failed'
    });
  }
};
