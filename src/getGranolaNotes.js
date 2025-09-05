import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { parseISO, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import fetch from 'node-fetch';

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

// Granola API endpoint
const GRANOLA_API_BASE = 'https://api.granola.ai/v1';

async function getGranolaCredentials() {
  try {
    // Check for Granola credentials in Application Support
    const credPath = path.join(os.homedir(), 'Library', 'Application Support', 'Granola', 'supabase.json');
    const credContent = await fs.readFile(credPath, 'utf8');
    const credentials = JSON.parse(credContent);
    
    // Parse the workos_tokens to get the access token
    if (!credentials.workos_tokens) {
      throw new Error('No workos_tokens found in Granola credentials');
    }
    
    const workosTokens = JSON.parse(credentials.workos_tokens);
    
    if (!workosTokens.access_token) {
      throw new Error('No access token found in workos_tokens');
    }
    
    return workosTokens.access_token;
  } catch (error) {
    console.error('Error reading Granola credentials:', error.message);
    throw error;
  }
}

async function fetchGranolaNotes(accessToken, startDate) {
  try {
    // Try different possible endpoints based on the logs we found
    const endpoints = [
      '/get-documents',
      '/documents',
      '/get-meeting-notes',
      '/meetings'
    ];
    
    let response;
    let data;
    
    for (const endpoint of endpoints) {
      try {
        console.log(`Trying endpoint: ${GRANOLA_API_BASE}${endpoint}`);
        response = await fetch(`${GRANOLA_API_BASE}${endpoint}`, {
          method: 'POST', // Changed to POST based on logs
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({}) // Empty body for now
        });
        
        if (response.ok) {
          data = await response.json();
          console.log(`Success with endpoint: ${endpoint}`);
          break;
        } else {
          console.log(`Failed with endpoint ${endpoint}: ${response.status}`);
        }
      } catch (err) {
        console.log(`Error with endpoint ${endpoint}: ${err.message}`);
      }
    }
    
    if (!data) {
      throw new Error('Could not fetch data from any endpoint');
    }
    
    // Debug: log the data structure
    console.log('API Response structure:', JSON.stringify(data, null, 2).substring(0, 500) + '...');
    
    // Parse start date and create interval
    const start = startOfDay(parseISO(startDate));
    const end = endOfDay(new Date());
    
    // Try different possible data structures
    const documents = data.documents || data.meetings || data.notes || data || [];
    const notesList = Array.isArray(documents) ? documents : [];
    
    console.log(`Found ${notesList.length} total notes`);
    
    // Filter notes by date - try different date fields
    const filteredNotes = notesList.filter(doc => {
      const possibleDates = [
        doc.date,
        doc.meeting_date, 
        doc.meetingDate,
        doc.created_at,
        doc.createdAt,
        doc.timestamp
      ].filter(Boolean);
      
      if (possibleDates.length === 0) {
        console.log('Note without date:', JSON.stringify(doc).substring(0, 200));
        return false;
      }
      
      for (const dateStr of possibleDates) {
        try {
          const docDate = new Date(dateStr);
          if (isWithinInterval(docDate, { start, end })) {
            return true;
          }
        } catch (e) {
          // Skip invalid dates
        }
      }
      
      return false;
    });

    console.log(`Filtered to ${filteredNotes.length} notes in date range`);
    return filteredNotes;
  } catch (error) {
    console.error('Error fetching Granola notes:', error.message);
    throw error;
  }
}

function formatNotes(notes) {
  if (notes.length === 0) {
    console.log('No Granola meeting notes found for the specified date range.');
    return;
  }

  console.log('\nGranola Meeting Notes');
  console.log('----------------------------------------');
  
  notes.forEach((note) => {
    console.log('Title:', note.title || 'Untitled Meeting');
    
    // Find and format the date
    const possibleDates = [
      note.date,
      note.meeting_date, 
      note.meetingDate,
      note.created_at,
      note.createdAt,
      note.timestamp
    ].filter(Boolean);
    
    if (possibleDates.length > 0) {
      try {
        const date = new Date(possibleDates[0]);
        console.log('Date:', date.toLocaleString());
      } catch (e) {
        console.log('Date:', possibleDates[0]);
      }
    }
    
    // Extract attendees if available
    if (note.attendees && note.attendees.length > 0) {
      console.log('Attendees:', note.attendees.join(', '));
    }
    
    // Extract summary from notes content if available
    if (note.summary) {
      console.log('Summary:', note.summary);
    } else if (note.notes && note.notes.content) {
      // Try to extract a brief summary from the first few content blocks
      const textContent = [];
      for (const block of note.notes.content.slice(0, 3)) {
        if (block.content) {
          for (const item of block.content) {
            if (item.text) {
              textContent.push(item.text);
            }
          }
        }
      }
      if (textContent.length > 0) {
        console.log('First lines:', textContent.slice(0, 2).join(' ').substring(0, 200) + '...');
      }
    }
    
    console.log('----------------------------------------');
  });
}

async function main() {
  try {
    console.log('Fetching Granola credentials...');
    const accessToken = await getGranolaCredentials();
    
    console.log('Fetching meeting notes from Granola...');
    const notes = await fetchGranolaNotes(accessToken, argv.startDate);
    
    formatNotes(notes);
  } catch (error) {
    console.error('Failed to fetch Granola notes:', error.message);
    process.exit(1);
  }
}

main();