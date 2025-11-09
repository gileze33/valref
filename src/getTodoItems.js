import dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { format, parseISO, startOfDay } from 'date-fns';
import fetch from 'node-fetch';

dotenv.config();

const TODO_API_ENDPOINT = 'https://todo.boonwilliams.com/api/tasks';

async function fetchTodoItems(startDate) {
  const apiKey = process.env.TODOG_KEY;
  if (!apiKey) {
    throw new Error('TODOG_KEY environment variable is not set');
  }

  // Convert start date to start of day
  const queryDate = startOfDay(parseISO(startDate));

  try {
    const response = await fetch(TODO_API_ENDPOINT, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.log(await response.text());
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const tasks = await response.json();

    if (!tasks || tasks.length === 0) {
      console.log('No tasks found.');
      return;
    }

    // Filter tasks based on date fields
    // Adjust the property names based on your API response structure
    const relevantTasks = tasks.filter(task => {
      // Try different possible date field names
      const startDateValue = task.startDate || task.started || task.start_date || task.createdAt;
      const endDateValue = task.endDate || task.finished || task.end_date || task.completedAt;

      if (!startDateValue && !endDateValue) return false;

      const startDateObj = startDateValue ? new Date(startDateValue) : null;
      const endDateObj = endDateValue ? new Date(endDateValue) : null;

      // Include task if either date is after or equal to the query date
      return (startDateObj && startDateObj >= queryDate) ||
             (endDateObj && endDateObj >= queryDate);
    });

    if (relevantTasks.length === 0) {
      console.log('No TODO items found for the specified date range.');
      return;
    }

    console.log('\nTODO items since', startDate);
    console.log('----------------------------------------');

    relevantTasks.forEach(task => {
      // Adjust property names based on your API response structure
      const title = task.title || task.name;
      const description = task.description || task.notes || task.details;
      const type = task.type || task.category || 'No type specified';
      const startDateValue = task.startDate || task.started || task.start_date || task.createdAt;
      const endDateValue = task.endDate || task.finished || task.end_date || task.completedAt;

      const startDateObj = startDateValue ? new Date(startDateValue) : null;
      const endDateObj = endDateValue ? new Date(endDateValue) : null;

      // Filter out personal tasks if needed
      if (type === 'Personal' || type === 'personal') return;

      console.log('Title:', title);
      console.log('Type:', type);
      if (description) {
        console.log('Description:', description);
      }
      if (startDateObj) {
        console.log('Started:', format(startDateObj, 'yyyy-MM-dd'));
      }
      if (endDateObj) {
        console.log('Finished:', format(endDateObj, 'yyyy-MM-dd'));
      }
      console.log('----------------------------------------');
    });

  } catch (error) {
    console.error('Error fetching TODO items:', error.message);
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
fetchTodoItems(argv.startDate).catch(console.error);
