// server.js
import express from 'express';
import { paymentMiddleware } from 'x402-express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const app = express();

// Price per segment (e.g., $0.001 in USDC on Base)
const PRICE_PER_SEGMENT = '$0.001';
const RECEIVER_ADDRESS = '0x75a8792ef34334871be60e2f2713762ce407e55f';

// Session storage for paid segments
// Maps sessionId -> Set of paid segment IDs
const paidSessions = new Map();

// Middleware to handle session cookies
app.use((req, res, next) => {
  // Parse cookies
  const cookies = {};
  (req.headers.cookie || '').split(';').forEach(cookie => {
    const [name, value] = cookie.trim().split('=');
    if (name && value) cookies[name] = value;
  });
  req.cookies = cookies;

  // Get or create session
  let sessionId = cookies['x402_session'];
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    res.setHeader('Set-Cookie', `x402_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax`);
  }
  req.sessionId = sessionId;

  if (!paidSessions.has(sessionId)) {
    paidSessions.set(sessionId, new Set());
  }
  req.paidSegments = paidSessions.get(sessionId);

  next();
});

// Serve the playlist for free
app.get('/video/playlist.m3u8', (req, res) => {
  const playlist = fs.readFileSync('./segments/playlist.m3u8', 'utf8');
  const modified = playlist.replace(/segment_(\d+)\.ts/g, '/video/segment/$1');
  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.send(modified);
});

// Route configuration for x402 payment
const routes = {
  '/video/segment/[id]': {
    price: PRICE_PER_SEGMENT,
    network: 'base-sepolia',
    config: {
      description: 'Video segment access',
    }
  }
};

const facilitatorConfig = {
  url: 'https://x402.org/facilitator'
};

// Demo mode - set DEMO_MODE=true to bypass payments
const DEMO_MODE = process.env.DEMO_MODE === 'true';

// Custom middleware that checks session before requiring payment
const sessionAwarePayment = (req, res, next) => {
  const segmentId = req.params.id;

  // If already paid in this session, skip payment
  if (req.paidSegments.has(segmentId)) {
    console.log(`Segment ${segmentId} already paid in session ${req.sessionId}`);
    return next();
  }

  // Check if this is a programmatic request (from HLS player) vs browser request
  const acceptHeader = req.header('Accept') || '';
  const isHLSRequest = !acceptHeader.includes('text/html');

  // If it's an HLS player request and not paid, return 402 JSON
  if (isHLSRequest && !req.header('X-PAYMENT')) {
    return res.status(402).json({
      x402Version: 1,
      error: 'Payment required',
      segmentId: segmentId,
      paymentUrl: `/pay/${segmentId}`
    });
  }

  // Use the x402 payment middleware for browser requests
  const middleware = paymentMiddleware(RECEIVER_ADDRESS, routes, facilitatorConfig);
  middleware(req, res, (err) => {
    if (err) return next(err);

    // Payment successful - record it in session
    req.paidSegments.add(segmentId);
    console.log(`Segment ${segmentId} paid, added to session ${req.sessionId}`);
    next();
  });
};

// Dedicated payment page for a segment
app.get('/pay/:id', (req, res) => {
  const segmentId = req.params.id;

  // If already paid, redirect to success
  if (req.paidSegments.has(segmentId)) {
    return res.redirect(`/payment-success/${segmentId}`);
  }

  // Return a page that embeds the payment flow
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Pay for Segment ${segmentId}</title>
      <style>
        body { font-family: system-ui; background: #1a1a2e; color: white; margin: 0; padding: 20px; }
        .container { max-width: 500px; margin: 0 auto; text-align: center; }
        h1 { font-size: 1.5rem; }
        .price { font-size: 2rem; color: #4ade80; margin: 1rem 0; }
        .frame-container { background: white; border-radius: 12px; overflow: hidden; margin: 1rem 0; }
        iframe { width: 100%; height: 550px; border: none; }
        a { color: #60a5fa; }
        .back { margin-top: 1rem; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Payment Required</h1>
        <p>Segment #${segmentId}</p>
        <div class="price">$0.001 USDC</div>
        <div class="frame-container">
          <iframe id="payframe" src="/video/segment/${segmentId}"></iframe>
        </div>
        <p class="back"><a href="/">Back to player</a></p>
      </div>
      <script>
        // Listen for successful payment (iframe will try to load video content)
        // Poll to check if payment completed
        const checkInterval = setInterval(async () => {
          try {
            const res = await fetch('/api/check-paid/${segmentId}');
            const data = await res.json();
            if (data.isPaid) {
              clearInterval(checkInterval);
              window.location.href = '/payment-success/${segmentId}';
            }
          } catch (e) {}
        }, 2000);
      </script>
    </body>
    </html>
  `);
});

// Payment success page
app.get('/payment-success/:id', (req, res) => {
  const segmentId = req.params.id;
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payment Successful</title>
      <style>
        body { font-family: system-ui; background: #1a1a2e; color: white; margin: 0; padding: 20px; text-align: center; }
        .success { font-size: 3rem; margin: 2rem 0; }
        a { color: #60a5fa; font-size: 1.2rem; }
      </style>
    </head>
    <body>
      <div class="success">Payment Successful!</div>
      <p>Segment #${segmentId} is now unlocked</p>
      <p><a href="/">Return to Video Player</a></p>
      <script>
        // Auto-close if opened as popup
        if (window.opener) {
          window.opener.postMessage({ type: 'payment-success', segmentId: '${segmentId}' }, '*');
          setTimeout(() => window.close(), 1500);
        }
      </script>
    </body>
    </html>
  `);
});

// Check if segment is paid
app.get('/api/check-paid/:id', (req, res) => {
  const segmentId = req.params.id;
  const isPaid = req.paidSegments.has(segmentId);
  res.json({ segmentId, isPaid });
});

// Segment endpoint with payment
app.get('/video/segment/:id',
  ...(DEMO_MODE ? [] : [sessionAwarePayment]),
  (req, res) => {
    const segmentId = req.params.id.padStart(3, '0');
    const segmentPath = `./segments/segment_${segmentId}.ts`;

    if (!fs.existsSync(segmentPath)) {
      return res.status(404).send('Segment not found');
    }

    console.log(`Serving segment ${segmentId}`);

    res.setHeader('Content-Type', 'video/MP2T');
    res.setHeader('Cache-Control', 'no-cache');
    fs.createReadStream(segmentPath).pipe(res);
  }
);

app.use(express.static('public'));

app.listen(3000, () => {
  console.log('Pay-per-view server running on http://localhost:3000');
  if (DEMO_MODE) console.log('DEMO MODE: Payments disabled');
});
