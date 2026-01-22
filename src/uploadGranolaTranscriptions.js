import dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import fetch from 'node-fetch';
import { subDays, format } from 'date-fns';
import { getGranolaCredentials, fetchGranolaNotes } from './granola.js';

dotenv.config();

const TODO_API_ENDPOINT = 'https://todo.boonwilliams.com/api/transcriptions';

const argv = yargs(hideBin(process.argv))
  .option('days', {
    alias: 'd',
    description: 'Number of days to look back',
    type: 'number',
    default: 5
  })
  .help()
  .argv;

async function uploadTranscriptions(notes) {
  const apiKey = process.env.TODOG_KEY;
  if (!apiKey) {
    throw new Error('TODOG_KEY environment variable is not set');
  }

  const transcriptions = notes.map(note => ({
    source: 'granola',
    source_id: note.id,
    raw_data: note
  }));

  // const note = notes.find(note => note.id === '444ef89d-10cf-4cd9-b109-a39a565b08a1');

  // console.log(JSON.stringify(note, null, 2));
  // process.exit(0);

  const response = await fetch(TODO_API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(transcriptions)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload failed: ${response.status} - ${errorText}`);
  }

  return response.json();
}

async function main() {
  try {
    const startDate = format(subDays(new Date(), argv.days), 'yyyy-MM-dd');

    console.log('Fetching Granola credentials...');
    const accessToken = await getGranolaCredentials();

    console.log(`Fetching meeting notes from last ${argv.days} days (since ${startDate})...`);
    const notes = await fetchGranolaNotes(accessToken, startDate, { includeTranscripts: true });

    if (notes.length === 0) {
      console.log('No notes found for the specified date range.');
      return;
    }

    console.log(`Found ${notes.length} notes. Uploading to TODO app...`);
    const result = await uploadTranscriptions(notes);

    console.log('Upload complete:', result);
  } catch (error) {
    console.error('Failed:', error.message);
    process.exit(1);
  }
}

main();
