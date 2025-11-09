import { google } from 'googleapis';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import dotenv from 'dotenv';
import { endOfDay, format, parseISO, startOfDay } from 'date-fns';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TOKEN_PATH = path.join(__dirname, '..', 'token.json');

async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

async function authorize() {
  const client = await loadSavedCredentialsIfExist();

  if (!client) {
    console.error('Error: No valid authentication token found.');
    console.error('Please run: yarn calendar-auth');
    process.exit(1);
  }

  return client;
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
    // Check if this is an authentication error
    if (error.code === 401 || error.message?.includes('invalid_grant') || error.message?.includes('Token has been expired or revoked')) {
      console.error('Error: Authentication token is invalid or expired.');
      console.error('Please run: yarn calendar-auth');
      process.exit(1);
    }
    console.error('Error fetching calendar events:', error, error?.response?.data?.error);
    process.exit(1);
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
  .catch(error => {
    console.error(error);
    process.exit(1);
  }); 