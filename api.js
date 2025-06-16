import express from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const app = express();
app.use(express.json());

// Config from environment
const PLAYFAB_TITLE_ID = "167991";
const PLAYFAB_SECRET_KEY = "ENU3HAAYNWKUSDEIFOF6NOMEDDWQFWSP5RWQYDZPI34K8ARP87";
const HMAC_SECRET = "RVXNIXRUNXCHEVE09736";

if (!PLAYFAB_TITLE_ID || !PLAYFAB_SECRET_KEY || !HMAC_SECRET) {
  throw new Error('Missing env vars: PLAYFAB_TITLE_ID, PLAYFAB_SECRET_KEY, RVXRIZIEI08883ySYRO875667561');
}

// Simple in-memory nonce store (for production use Redis or DB)
const recentNonces = new Set();
const NONCE_EXPIRY_MS = 60 * 1000;

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests, slow down.' }
});
app.use(limiter);

// Helper to verify HMAC
function verifyHMAC(customId, timestamp, nonce, signature) {
  const message = `${customId}${timestamp}${nonce}`;
  const expectedSig = crypto.createHmac('sha256', HMAC_SECRET)
    .update(message)
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
}

// Helper to call PlayFab
async function playfabPost(endpoint, data) {
  try {
    const url = `https://${PLAYFAB_TITLE_ID}.playfabapi.com/${endpoint}`;
    const res = await axios.post(url, data, {
      headers: { 'X-SecretKey': PLAYFAB_SECRET_KEY }
    });
    return res.data;
  } catch (err) {
    console.error('PlayFab request failed:', err.response?.data || err.message);
    return null;
  }
}

// Cleanup old nonces
setInterval(() => {
  recentNonces.clear();
}, NONCE_EXPIRY_MS);

// API endpoint
app.post('/api/authenticate', async (req, res) => {
  const { CustomId, Timestamp, Nonce, Signature } = req.body;

  if (!CustomId || !Timestamp || !Nonce || !Signature) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const now = Date.now();
  if (Math.abs(now - Number(Timestamp)) > 30 * 1000) {
    return res.status(400).json({ error: 'Timestamp too old' });
  }

  if (recentNonces.has(Nonce)) {
    return res.status(400).json({ error: 'Nonce reuse detected' });
  }

  if (!verifyHMAC(CustomId, Timestamp, Nonce, Signature)) {
    return res.status(403).json({ error: 'Invalid signature' });
  }

  recentNonces.add(Nonce);

  // Call PlayFab to login
  const pfResponse = await playfabPost('Server/LoginWithServerCustomId', {
    ServerCustomId: CustomId,
    CreateAccount: true
  });

  if (!pfResponse) {
    return res.status(500).json({ error: 'PlayFab login failed' });
  }

  const { PlayFabId, SessionTicket, EntityToken } = pfResponse.data || {};
  res.json({
    PlayFabId,
    SessionTicket,
    EntityToken: EntityToken?.EntityToken
  });
});

// Example title data route
app.get('/api/titledata', async (req, res) => {
  const pfResponse = await playfabPost('Server/GetTitleData', {});
  if (!pfResponse) {
    return res.status(500).json({ error: 'Failed to retrieve title data' });
  }
  res.json(pfResponse.data?.Data || {});
});

// Start server
app.listen(8080, () => {
  console.log('Backend running on port 8080');
});
