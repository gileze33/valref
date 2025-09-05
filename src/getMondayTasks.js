import dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { format, parseISO, startOfDay, endOfDay } from 'date-fns';
import fetch from 'node-fetch';

dotenv.config();

const MONDAY_API_ENDPOINT = 'https://api.monday.com/v2';

async function fetchTodoItems(startDate) {
  const apiKey = process.env.MONDAY_API_KEY;
  if (!apiKey) {
    throw new Error('MONDAY_API_KEY environment variable is not set');
  }

  // Convert start date to start of day
  const queryDate = startOfDay(parseISO(startDate));
  
  // GraphQL query to fetch items from the board
  const query = `
    query {
      boards (ids: [${process.env.MONDAY_BOARD_ID || 'YOUR_BOARD_ID'}]) {
        name
        columns {
          id
          title
          type
        }
        items_page {
          items {
            id
            name
            column_values {
              column {
                id
                title
              }
              text
              value
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(MONDAY_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey
      },
      body: JSON.stringify({ query })
    });

    if (!response.ok) {
      console.log(await response.text());
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.errors) {
      throw new Error(`GraphQL Error: ${JSON.stringify(data.errors)}`);
    }

    const board = data.data.boards[0];
    if (!board) {
      console.log('Board not found.');
      return;
    }

    console.log('Board:', board.name);

    // Get all items from the board
    const items = board.items_page?.items || [];
    
    if (!items || items.length === 0) {
      console.log('No items found on the board.');
      return;
    }

    // Filter items based on date fields
    const relevantItems = items.filter(item => {
      const startDateValue = item.column_values.find(col => col.column.title === 'Started')?.value;
      const endDateValue = item.column_values.find(col => col.column.title === 'Finished')?.value;
      
      if (!startDateValue && !endDateValue) return false;

      const startDateObj = startDateValue ? new Date(JSON.parse(startDateValue).date) : null;
      const endDateObj = endDateValue ? new Date(JSON.parse(endDateValue).date) : null;

      // Include item if either date is after or equal to the query date
      return (startDateObj && startDateObj >= queryDate) || 
             (endDateObj && endDateObj >= queryDate);
    });

    if (relevantItems.length === 0) {
      console.log('No TODO items found for the specified date range.');
      return;
    }

    console.log('\nTODO items since', startDate);
    console.log('----------------------------------------');

    relevantItems.forEach(item => {
      const startDateValue = item.column_values.find(col => col.column.title === 'Started')?.value;
      const endDateValue = item.column_values.find(col => col.column.title === 'Finished')?.value;
      const typeValue = item.column_values.find(col => col.column.title === 'Type')?.text || 'No type specified';
      
      // Parse the date values from the JSON strings
      const startDateObj = startDateValue ? new Date(JSON.parse(startDateValue).date) : null;
      const endDateObj = endDateValue ? new Date(JSON.parse(endDateValue).date) : null;

      if (typeValue === 'Personal') return;

      console.log('Title:', item.name);
      console.log('Type:', typeValue);
      if (startDateObj) {
        console.log('Started:', format(startDateObj, 'yyyy-MM-dd'));
      }
      if (endDateObj) {
        console.log('Finished:', format(endDateObj, 'yyyy-MM-dd'));
      }
      console.log('----------------------------------------');
    });

  } catch (error) {
    console.error('Error fetching Monday.com TODO items:', error.message);
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
fetchTodoItems(argv.startDate).catch(console.error); 