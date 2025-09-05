import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import dotenv from 'dotenv';
import { format, startOfWeek } from 'date-fns';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ChatGPT setup
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY environment variable is not set');
  process.exit(1);
}

async function getCommandOutput(command) {
  try {
    const { stdout, stderr } = await execAsync(command);
    if (stderr) {
      console.error('Command stderr:', stderr);
    }
    return stdout;
  } catch (error) {
    throw new Error(`Command execution failed: ${error.message}`);
  }
}

async function getAnalysisPrompt() {
  const promptPath = path.join(__dirname, '..', 'analysis-prompt.txt');
  try {
    const prompt = await fs.readFile(promptPath, 'utf8');
    return prompt.trim();
  } catch (error) {
    throw new Error(`Failed to read analysis prompt file at ${promptPath}: ${error.message}`);
  }
}

async function getCurrentKeyProjects() {
  const projectsPath = path.join(__dirname, '..', 'current-key-projects.txt');
  try {
    const projects = await fs.readFile(projectsPath, 'utf8');
    return projects.trim();
  } catch (error) {
    // If file doesn't exist, return empty string
    if (error.code === 'ENOENT') {
      return '';
    }
    throw new Error(`Failed to read current key projects file at ${projectsPath}: ${error.message}`);
  }
}

async function analyzeThroughChatGPT(calendarOutput, mrsOutput, mondayTasksOutput, granolaOutput, keyProjects) {
  const openai = axios.create({
    baseURL: 'https://api.openai.com/v1',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  // Get the analysis prompt from file
  const analysisPrompt = await getAnalysisPrompt();

  const prompt = `${analysisPrompt}

Current key projects context:
${keyProjects}

Google calendar info:
${calendarOutput}

Gitlab merge requests:
${mrsOutput}

Monday.com tasks:
${mondayTasksOutput}

Granola meeting notes:
${granolaOutput}`;

  try {
    const response = await openai.post('/chat/completions', {
      model: "gpt-4.1-mini",
      messages: [{
        role: "user",
        content: prompt
      }],
      temperature: 0.7
    });

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error(error.response?.data);
    throw new Error(`Error calling ChatGPT API: ${error.message}`);
  }
}

// Get this Monday's date (most recent Monday)
function getThisMondayDate() {
  const today = new Date();
  const monday = startOfWeek(today, { weekStartsOn: 1 }); // 1 = Monday
  return format(monday, 'yyyy-MM-dd');
}

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option('startDate', {
    alias: 's',
    description: 'Start date (YYYY-MM-DD) - defaults to this Monday',
    type: 'string',
    default: getThisMondayDate()
  })
  .help()
  .usage('Usage: $0 [options]\nAnalyzes time spent since the start date (defaults to this Monday)')
  .example('$0', 'Analyze time from this Monday to today')
  .example('$0 -s 2025-09-01', 'Analyze time from September 1st to today')
  .argv;

async function main() {
  try {
    // Build commands based on input
    // Now always use startDate (which defaults to this Monday)
    const dateArg = `-s "${argv.startDate}"`;

    // Get outputs from all commands
    console.log(`Fetching calendar...`);
    const calendarOutput = await getCommandOutput(`yarn calendar ${dateArg}`);
    console.log(`Fetching merged MRs...`);
    const mrsOutput = await getCommandOutput(`yarn merged-mrs ${dateArg}`);
    console.log(`Fetching Monday.com tasks...`);
    const mondayTasksOutput = await getCommandOutput(`yarn monday-tasks ${dateArg}`);
    console.log(`Fetching Granola meeting notes...`);
    const granolaOutput = await getCommandOutput(`yarn granola-notes ${dateArg}`);

    // Get current key projects
    const keyProjects = await getCurrentKeyProjects();

    // Analyze through ChatGPT
    console.log(`Analysing...`);
    const analysis = await analyzeThroughChatGPT(calendarOutput, mrsOutput, mondayTasksOutput, granolaOutput, keyProjects);
    
    // Output the analysis
    console.log('\n\nTime Analysis:\n');
    console.log(analysis);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main(); 