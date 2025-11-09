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

// Granola API endpoints
const GRANOLA_API_V1 = 'https://api.granola.ai/v1';
const GRANOLA_API_V2 = 'https://api.granola.ai/v2';

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

async function fetchDocumentTranscript(accessToken, documentId) {
  try {
    const response = await fetch(`${GRANOLA_API_V1}/get-document-transcript`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        document_id: documentId
      })
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    return data.transcript || data || null;
  } catch (error) {
    return null;
  }
}

async function fetchGranolaNotes(accessToken, startDate) {
  try {
    // Use v2 API endpoint as discovered in the Granola-to-Obsidian code
    const response = await fetch(`${GRANOLA_API_V2}/get-documents`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        limit: 100,
        offset: 0,
        include_last_viewed_panel: true  // This is the key parameter!
      })
    });
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }
    
    const responseData = await response.json();
    let data = responseData.docs || responseData || [];
    
    
    // Parse start date and create interval
    const start = startOfDay(parseISO(startDate));
    const end = endOfDay(new Date());
    
    // Try different possible data structures
    const documents = data.documents || data.meetings || data.notes || data || [];
    const notesList = Array.isArray(documents) ? documents : [];
    
    // Found notes
    
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

    // Fetch transcripts for each document (optional - not all meetings have transcripts)
    for (const note of filteredNotes) {
      if (note.id) {
        note.transcript = await fetchDocumentTranscript(accessToken, note.id);
      }
    }
    
    return filteredNotes;
  } catch (error) {
    console.error('Error fetching Granola notes:', error.message);
    throw error;
  }
}

function extractNotesContent(notes) {
  // Extract text content from the nested notes structure
  const textContent = [];
  
  if (!notes || !notes.content) {
    return '';
  }
  
  function extractTextFromBlock(block) {
    if (!block) return;
    
    // Handle text directly in the block
    if (block.text) {
      textContent.push(block.text);
    }
    
    // Handle various block types
    if (block.type === 'paragraph' || block.type === 'heading') {
      if (block.content && Array.isArray(block.content)) {
        for (const item of block.content) {
          if (item.type === 'text' && item.text) {
            textContent.push(item.text);
          } else {
            // Recursively extract from nested blocks
            extractTextFromBlock(item);
          }
        }
      }
    } else if (block.type === 'bulletList' || block.type === 'orderedList') {
      // Note: ProseMirror uses camelCase for list types
      if (block.content && Array.isArray(block.content)) {
        for (const listItem of block.content) {
          extractTextFromBlock(listItem);
        }
      }
    } else if (block.type === 'listItem') {
      if (block.content && Array.isArray(block.content)) {
        for (const item of block.content) {
          extractTextFromBlock(item);
        }
      }
    } else if (block.type === 'blockquote' || block.type === 'codeBlock') {
      if (block.content && Array.isArray(block.content)) {
        for (const item of block.content) {
          extractTextFromBlock(item);
        }
      }
    }
  }
  
  if (Array.isArray(notes.content)) {
    for (const block of notes.content) {
      extractTextFromBlock(block);
    }
  }
  
  return textContent.join(' ').trim();
}

function formatNotes(notes) {
  if (notes.length === 0) {
    console.log('No Granola meeting notes found for the specified date range.');
    return;
  }

  console.log('\nGranola Meeting Notes');
  console.log('========================================\n');
  
  notes.forEach((note, index) => {
    // Title
    console.log(`Meeting ${index + 1}: ${note.title || 'Untitled Meeting'}`);
    console.log('----------------------------------------');
    
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
    
    // Print meeting duration if available
    if (note.duration) {
      console.log('Duration:', note.duration);
    }
    
    console.log('\nMeeting Notes:');
    console.log('--------------');
    
    // Extract full meeting notes content
    let notesContent = '';
    
    // First try the last_viewed_panel field (from v2 API)
    if (note.last_viewed_panel && note.last_viewed_panel.content) {
      notesContent = extractNotesContent(note.last_viewed_panel);
    } else if (note.notes_plain) {
      notesContent = note.notes_plain;
    } else if (note.summary) {
      notesContent = note.summary;
    } else if (note.notes) {
      notesContent = extractNotesContent(note.notes);
    } else if (note.content) {
      // Sometimes the content might be at the top level
      notesContent = extractNotesContent({ content: note.content });
    } else if (note.text) {
      notesContent = note.text;
    }
    
    // Check for transcript first (full meeting content)
    if (note.transcript) {
      console.log('TRANSCRIPT:');
      if (Array.isArray(note.transcript)) {
        // Format transcript entries
        const formattedTranscript = note.transcript
          .map(entry => `${entry.source === 'microphone' ? 'You' : 'Other'}: ${entry.text}`)
          .join('\n');
        console.log(formattedTranscript);
      } else if (typeof note.transcript === 'string') {
        console.log(note.transcript);
      } else {
        console.log(JSON.stringify(note.transcript, null, 2));
      }
    }
    
    if (notesContent && notesContent.trim()) {
      // Clean up and format the content
      console.log('SUMMARY:');
      console.log(notesContent.trim());
    }
    
    // If no transcript or summary content
    if (!note.transcript && (!notesContent || !notesContent.trim())) {
      console.log('[No notes content available]');
    }
    
    // Add attendees from google calendar event if available
    if (note.google_calendar_event && note.google_calendar_event.attendees) {
      console.log('\nAttendees:');
      note.google_calendar_event.attendees.forEach(attendee => {
        console.log(`- ${attendee.displayName || attendee.email}${attendee.organizer ? ' (Organizer)' : ''}`);
      });
    }
    
    console.log('\n========================================\n');
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