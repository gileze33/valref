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