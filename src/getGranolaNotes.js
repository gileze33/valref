import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { getGranolaCredentials, fetchGranolaNotes } from './granola.js';

const argv = yargs(hideBin(process.argv))
  .option('startDate', {
    alias: 's',
    description: 'Start date (YYYY-MM-DD)',
    type: 'string',
    required: true
  })
  .help()
  .argv;

function extractNotesContent(notes) {
  const textContent = [];

  if (!notes || !notes.content) {
    return '';
  }

  function extractTextFromBlock(block) {
    if (!block) return;

    if (block.text) {
      textContent.push(block.text);
    }

    if (block.type === 'paragraph' || block.type === 'heading') {
      if (block.content && Array.isArray(block.content)) {
        for (const item of block.content) {
          if (item.type === 'text' && item.text) {
            textContent.push(item.text);
          } else {
            extractTextFromBlock(item);
          }
        }
      }
    } else if (block.type === 'bulletList' || block.type === 'orderedList') {
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
    console.log(`Meeting ${index + 1}: ${note.title || 'Untitled Meeting'}`);
    console.log('----------------------------------------');

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

    if (note.attendees && note.attendees.length > 0) {
      console.log('Attendees:', note.attendees.join(', '));
    }

    if (note.duration) {
      console.log('Duration:', note.duration);
    }

    console.log('\nMeeting Notes:');
    console.log('--------------');

    let notesContent = '';

    if (note.last_viewed_panel && note.last_viewed_panel.content) {
      notesContent = extractNotesContent(note.last_viewed_panel);
    } else if (note.notes_plain) {
      notesContent = note.notes_plain;
    } else if (note.summary) {
      notesContent = note.summary;
    } else if (note.notes) {
      notesContent = extractNotesContent(note.notes);
    } else if (note.content) {
      notesContent = extractNotesContent({ content: note.content });
    } else if (note.text) {
      notesContent = note.text;
    }

    if (note.transcript) {
      console.log('TRANSCRIPT:');
      if (Array.isArray(note.transcript)) {
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
      console.log('SUMMARY:');
      console.log(notesContent.trim());
    }

    if (!note.transcript && (!notesContent || !notesContent.trim())) {
      console.log('[No notes content available]');
    }

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
