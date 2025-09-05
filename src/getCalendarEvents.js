import { google } from 'googleapis';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import dotenv from 'dotenv';
import { endOfDay, format, parseISO, startOfDay } from 'date-fns';
import readlineLib from 'readline';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const TOKEN_PATH = path.join(__dirname, '..', 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials.json');

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

async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }

  // Load client secrets from a local file.
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;

  const oAuth2Client = new google.auth.OAuth2(
    key.client_id,
    key.client_secret,
    key.redirect_uris[0]
  );

  // Generate an authentication URL
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    // This will force the consent screen to appear every time,
    // ensuring we get a refresh token
    prompt: 'consent'
  });

  console.log('Authorize this app by visiting this url:', authUrl);
  
  // Wait for the authorization code from the user
  const code = await new Promise((resolve) => {
    const readline = readlineLib.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    readline.question('Enter the code from that page here: ', (code) => {
      readline.close();
      resolve(code);
    });
  });

  // Get both access and refresh tokens
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);

  // Save the credentials for later use
  await saveCredentials(oAuth2Client);
  
  return oAuth2Client;
}

async function listEvents(auth, startDate) {
  const calendar = google.calendar({ version: 'v3', auth });
  
  try {
    // Parse the input date and ensure it's in ISO format with timezone
    const parsedDate = startOfDay(parseISO(startDate));
    const isoDate = parsedDate.toISOString();

    console.log('Fetching events from:', isoDate);
    
    const res = await calendar.events.list({
      calendarId: process.env.CALENDAR_ID || 'primary',
      timeMin: isoDate,
      maxResults: 1000,
      singleEvents: true,
      orderBy: 'startTime',
    });
    
    const events = res.data.items;
    if (!events || events.length === 0) {
      console.log('No events found.');
      return;
    }

    // Filter events to ensure they start after the specified date
    const filteredEvents = events.filter(event => {
      const eventStart = new Date(event.start.dateTime || event.start.date);
      const today = endOfDay(new Date()); // Get END of today
      return eventStart >= parsedDate && eventStart <= today;
    });

    if (filteredEvents.length === 0) {
      console.log('No events found between the specified date and today.');
      return;
    }

    console.log(`Meetings from ${startDate} to ${format(new Date(), 'yyyy-MM-dd')}`);
    console.log('----------------------------------------');
    
    filteredEvents.forEach((event) => {
      const start = event.start.dateTime || event.start.date;
      const end = event.end.dateTime || event.end.date;
      const attendees = event.attendees 
        ? event.attendees
            .filter(a => !a.resource) // Filter out resource (room) attendees
            .map(a => a.email)
            .join(', ')
        : 'No other attendees';
      
      console.log('Title:', event.summary);
      console.log('Start:', format(new Date(start), 'yyyy-MM-dd HH:mm'));
      console.log('End:', format(new Date(end), 'yyyy-MM-dd HH:mm'));
      console.log('Participants:', attendees);
      if (event.description) {
        console.log('Description:', event.description);
      }
      console.log('----------------------------------------');
    });
  } catch (error) {
    console.error('Error fetching calendar events:', error, error?.response?.data?.error);
  }
}

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option('startDate', {
    alias: 's',
    description: 'Start date (YYYY-MM-DD)',
    type: 'string',
    required: true
  })
  .help()
  .argv;

// Main execution
authorize()
  .then(auth => listEvents(auth, argv.startDate))
  .catch(console.error); 