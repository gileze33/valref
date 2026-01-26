# Time Analysis Tool

A personal productivity tool that analyzes how you spend your time by pulling data from Google Calendar, GitLab merge requests, Monday.com tasks, and Granola meeting notes.

## Setup

### 1. Prerequisites
- Node.js and npm installed
- Access to: Google Calendar, GitLab, Monday.com, and Granola desktop app

### 2. Installation
```bash
npm install
```

### 3. Environment Variables
Create a `.env` file with:
```
OPENAI_API_KEY=your-openai-api-key
GITLAB_TOKEN=your-gitlab-token
GITLAB_PROJECT_ID=your-project-id
MONDAY_API_KEY=your-monday-api-key
MONDAY_BOARD_ID=your-board-id
```

### 4. Google Calendar Setup
1. Follow [Google Calendar API quickstart](https://developers.google.com/calendar/api/quickstart/nodejs)
2. Save `credentials.json` in the project root
3. Run `npm run calendar` once to authenticate (saves `token.json`)

### 5. Granola Setup
- Install and sign into [Granola desktop app](https://granola.ai)
- The script automatically reads auth from `~/Library/Application Support/Granola/`

### 6. Analysis Prompt
Create `analysis-prompt.txt` in the project root with your analysis instructions. Example:
```
I'm a principal software engineer and I'd like you to categorise the time I've spent...
```

### 7. Current Key Projects (Optional)
Create `current-key-projects.txt` in the project root to provide context about your current focus areas. This helps the AI better understand how your time relates to strategic priorities. Example:
```
# Project X
Describe what this project is
```

## Usage

```bash
# Analyze time from this Monday to today
npm run analyse

# Analyze from a specific date
npm run analyse -- -s 2025-09-01
```

## Individual Commands
- `npm run calendar` - Fetch Google Calendar events
- `npm run merged-mrs` - Fetch merged GitLab MRs
- `npm run monday-tasks` - Fetch Monday.com tasks
- `npm run granola-notes` - Fetch Granola meeting notes
- `npm run granola-upload` - Upload Granola transcriptions to TODO app
- `npm run todo-items` - Fetch TODO items

## Scheduled Granola Upload (macOS)

A launch agent is included to automatically upload Granola transcriptions every 30 minutes.

### Setup

1. Copy the plist to LaunchAgents:
```bash
cp com.valref.granola-upload.plist ~/Library/LaunchAgents/
```

2. Ensure your `~/.zshrc` exports `TODOG_KEY` and sets up node/yarn (e.g., via nvm)

3. Create the logs directory:
```bash
mkdir -p ~/dev/valref/logs
```

4. Load the agent:
```bash
launchctl load ~/Library/LaunchAgents/com.valref.granola-upload.plist
```

### Management
```bash
launchctl start com.valref.granola-upload   # Run immediately
launchctl stop com.valref.granola-upload    # Stop current run
launchctl unload ~/Library/LaunchAgents/com.valref.granola-upload.plist  # Disable
tail -f logs/granola-upload.log             # View logs
```