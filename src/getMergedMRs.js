import axios from 'axios';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { subDays, format } from 'date-fns';

// Get command line arguments
const argv = yargs(hideBin(process.argv))
  .option('days', {
    alias: 'd',
    description: 'Number of days to look back',
    type: 'number',
    default: 7
  })
  .option('date', {
    alias: 't',
    description: 'Start date in YYYY-MM-DD format',
    type: 'string'
  })
  .help()
  .alias('help', 'h')
  .argv;

// Get the GitLab token from environment
const token = process.env.GITLAB_TOKEN;
if (!token) {
  console.error('Error: GITLAB_TOKEN environment variable is not set');
  process.exit(1);
}

// Calculate the start date
const startDate = argv.date 
  ? new Date(argv.date)
  : subDays(new Date(), argv.days);

const formattedDate = format(startDate, 'yyyy-MM-dd');

// Create axios instance with GitLab API base URL and token
const gitlab = axios.create({
  baseURL: 'https://gitlab.com/api/v4',
  headers: { 'PRIVATE-TOKEN': token }
});

async function getMergedMRs() {
  try {
    // Get user ID first
    const userResponse = await gitlab.get('/user');
    const userId = userResponse.data.id;

    // Get merged MRs authored by the user
    const response = await gitlab.get('/merge_requests', {
      params: {
        state: 'merged',
        author_id: userId,
        updated_after: `${formattedDate}T00:00:00Z`,
        scope: 'all',
        per_page: 100
      }
    });

    const mergeRequests = response.data;

    if (mergeRequests.length === 0) {
      console.log(`No merged MRs found since ${formattedDate}`);
      return;
    }

    console.log(`\nMerged MRs since ${formattedDate}:\n`);
    
    mergeRequests.forEach((mr, index) => {
      console.log(`${index + 1}. ${mr.title}`);
      console.log(`   Project: ${mr.references.full}`);
      if (mr.description) {
        console.log(`   Description:\n   ${mr.description.replace(/\n/g, '\n   ')}\n`);
      }
      console.log('   ---\n');
    });

  } catch (error) {
    if (error.response) {
      console.error('Error:', error.response.data.message || error.response.data);
    } else {
      console.error('Error:', error.message);
    }
    process.exit(1);
  }
}

getMergedMRs(); 