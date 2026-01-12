require('dotenv').config();
const express = require('express');
const path = require('path');
const { PrivyClient } = require('@privy-io/node');

const app = express();
app.use(express.json());

const PRIVY_APP_ID = process.env.PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;

// Initialize Privy client
const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

// In-memory store (use a real DB in production)
const users = new Map();

// Serve bankr.bot static files
app.use(express.static(path.join(__dirname, '..'), { index: 'index.htm' }));

// Auth endpoint - immediate redirect to X OAuth via Privy (like bankrs.bot)
app.get('/auth/twitter', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Connecting to X...</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          margin: 0;
          background: #000;
          color: #fff;
        }
        .loader {
          width: 50px;
          height: 50px;
          border: 3px solid #333;
          border-top-color: #1d9bf0;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .container { text-align: center; }
        p { margin-top: 20px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="loader"></div>
        <p>Connecting to X...</p>
      </div>
      <script src="https://unpkg.com/@privy-io/react-auth@latest/dist/privy-react-auth.umd.js"></script>
      <script type="module">
        import { PrivyClient } from 'https://esm.sh/@privy-io/js-sdk-core@latest';

        const privy = new PrivyClient({
          appId: '${PRIVY_APP_ID}',
        });

        // Auto-trigger Twitter login immediately
        (async () => {
          try {
            await privy.login({
              loginMethods: ['twitter'],
              disableSignup: false
            });

            // Get access token after successful login
            const accessToken = await privy.getAccessToken();

            // Redirect to callback with token
            window.location.href = '/callback?token=' + encodeURIComponent(accessToken);
          } catch (err) {
            console.error('Auth error:', err);
            document.body.innerHTML = '<div style="text-align:center;padding:40px;"><h2>Authentication Failed</h2><p>' + err.message + '</p><a href="/" style="color:#1d9bf0;">Go Back</a></div>';
          }
        })();
      </script>
    </body>
    </html>
  `);
});

// Callback - verify token and get user data
app.get('/callback', async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Error</title></head>
      <body style="background:#000;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;">
        <div style="text-align:center;">
          <h2>Missing token</h2>
          <a href="/" style="color:#1d9bf0;">Go Back</a>
        </div>
      </body>
      </html>
    `);
  }

  try {
    // Verify the token with Privy
    const verifiedClaims = await privy.verifyAuthToken(token);
    const userId = verifiedClaims.userId;

    // Get user details from Privy
    const user = await privy.getUser(userId);

    // Get Twitter OAuth tokens
    let twitterTokens = null;
    if (user.twitter) {
      try {
        twitterTokens = await privy.getTwitterOAuthAccessToken(userId);
      } catch (e) {
        console.log('Could not get Twitter tokens:', e.message);
      }
    }

    // Store user data
    const userData = {
      privyId: userId,
      twitter: user.twitter ? {
        username: user.twitter.username,
        name: user.twitter.name,
        profilePictureUrl: user.twitter.profilePictureUrl,
        subject: user.twitter.subject,
      } : null,
      tokens: twitterTokens,
      createdAt: new Date().toISOString(),
    };

    users.set(userId, userData);
    console.log('User logged in:', userData.twitter?.username);

    // Success page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Welcome!</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #fff;
          }
          .container {
            text-align: center;
            padding: 40px;
            background: rgba(0,0,0,0.3);
            border-radius: 20px;
            backdrop-filter: blur(10px);
          }
          .avatar {
            width: 100px;
            height: 100px;
            border-radius: 50%;
            border: 4px solid #fff;
            margin-bottom: 20px;
          }
          .username {
            color: #1d9bf0;
            font-size: 24px;
            margin: 10px 0;
          }
          .success {
            color: #00ba7c;
            font-size: 48px;
            margin-bottom: 20px;
          }
          .btn {
            display: inline-block;
            margin-top: 20px;
            padding: 12px 24px;
            background: #1d9bf0;
            color: #fff;
            text-decoration: none;
            border-radius: 30px;
            font-weight: bold;
          }
          .btn:hover { background: #1a8cd8; }
          .info {
            margin-top: 20px;
            padding: 15px;
            background: rgba(0,0,0,0.2);
            border-radius: 10px;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success">✓</div>
          ${userData.twitter?.profilePictureUrl ? `<img src="${userData.twitter.profilePictureUrl}" class="avatar" />` : ''}
          <h1>Welcome!</h1>
          <p class="username">@${userData.twitter?.username || 'Unknown'}</p>
          <div class="info">
            <p>✓ Connected to X</p>
            <p>✓ Tokens received: ${twitterTokens ? 'Yes' : 'No'}</p>
          </div>
          <a href="/" class="btn">Continue to App</a>
        </div>
      </body>
      </html>
    `);

  } catch (err) {
    console.error('Callback error:', err);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Error</title></head>
      <body style="background:#000;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;">
        <div style="text-align:center;">
          <h2>Authentication Failed</h2>
          <p style="color:#666;">${err.message}</p>
          <a href="/auth/twitter" style="color:#1d9bf0;">Try Again</a>
        </div>
      </body>
      </html>
    `);
  }
});

// API: Get user info
app.get('/api/user/:privyId', (req, res) => {
  const user = users.get(req.params.privyId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(user);
});

// API: List all users
app.get('/api/users', (req, res) => {
  res.json(Array.from(users.values()));
});

// API: Post a tweet
app.post('/api/tweet', async (req, res) => {
  const { privyId, text } = req.body;

  if (!privyId || !text) {
    return res.status(400).json({ error: 'Missing privyId or text' });
  }

  const user = users.get(privyId);
  if (!user || !user.tokens) {
    return res.status(404).json({ error: 'User not found or no tokens' });
  }

  try {
    const response = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${user.tokens.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data });
    }

    res.json({ success: true, tweet: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`📱 Privy App ID: ${PRIVY_APP_ID}`);
  console.log(`\nEndpoints:`);
  console.log(`  GET  /              - Bankr.bot frontend`);
  console.log(`  GET  /auth/twitter  - Start X OAuth (like bankrs.bot)`);
  console.log(`  GET  /callback      - OAuth callback`);
  console.log(`  GET  /api/users     - List logged in users`);
  console.log(`  POST /api/tweet     - Post tweet for user\n`);
});
