import { google } from 'googleapis';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import http from 'http';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const TOKEN_PATH = path.join(__dirname, '..', 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials.json');
const REDIRECT_URI = 'http://localhost:8888/oauth2callback';
const PORT = 8888;

async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = {
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  };
  await fs.writeFile(TOKEN_PATH, JSON.stringify(payload));
}

async function deleteToken() {
  try {
    await fs.unlink(TOKEN_PATH);
    console.log('Deleted invalid token.');
  } catch (err) {
    // Token file doesn't exist, that's fine
  }
}

async function validateToken(client) {
  try {
    // Try to get a calendar event to validate it
    const calendar = google.calendar({ version: 'v3', auth: client });
    await calendar.events.list({
      calendarId: process.env.CALENDAR_ID || 'primary',
      timeMin: new Date().toISOString(),
      maxResults: 1,
      singleEvents: true,
      orderBy: 'startTime',
    });
    return true;
  } catch (err) {
    console.log('Token validation failed:', err.message);
    return false;
  }
}

function startOAuthServer(oAuth2Client) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, `http://localhost:${PORT}`);

        if (url.pathname === '/oauth2callback') {
          const code = url.searchParams.get('code');

          if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<h1>Error: No authorization code received</h1>');
            server.close();
            reject(new Error('No authorization code received'));
            return;
          }

          // Exchange the authorization code for tokens
          try {
            const { tokens } = await oAuth2Client.getToken(code);
            oAuth2Client.setCredentials(tokens);

            // Save the credentials
            await saveCredentials(oAuth2Client);

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<h1>Authentication successful!</h1><p>You can close this window and return to the terminal.</p>');

            server.close();
            resolve(oAuth2Client);
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end(`<h1>Error during token exchange</h1><p>${err.message}</p>`);
            server.close();
            reject(err);
          }
        } else {
          res.writeHead(404, { 'Content-Type': 'text/html' });
          res.end('<h1>Not Found</h1>');
        }
      } catch (err) {
        server.close();
        reject(err);
      }
    });

    server.listen(PORT, () => {
      console.log(`OAuth server listening on port ${PORT}`);
    });

    server.on('error', (err) => {
      reject(err);
    });
  });
}

async function authorize() {
  // Try to load existing credentials
  let client = await loadSavedCredentialsIfExist();

  if (client) {
    // Validate the token
    const isValid = await validateToken(client);

    if (isValid) {
      console.log('Valid token found.');
      return client;
    } else {
      console.log('Token is invalid or expired.');
      await deleteToken();
      client = null;
    }
  }

  // No valid token, start OAuth flow
  console.log('No valid token found. Starting OAuth flow...');

  // Load client secrets from a local file
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;

  const oAuth2Client = new google.auth.OAuth2(
    key.client_id,
    key.client_secret,
    REDIRECT_URI
  );

  // Generate an authentication URL
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent' // Force consent to ensure we get a refresh token
  });

  console.log('\nAuthorize this app by visiting this URL:');
  console.log(authUrl);
  console.log('\nWaiting for authorization...');

  // Start the OAuth server and wait for the callback
  const authorizedClient = await startOAuthServer(oAuth2Client);

  console.log('Authorization successful! Token saved.');
  return authorizedClient;
}

// Main execution
authorize()
  .then(() => {
    console.log('\nGoogle Calendar authentication complete.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Authentication failed:', error.message);
    process.exit(1);
  });
