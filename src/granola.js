import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import fetch from 'node-fetch';
import { parseISO, startOfDay, endOfDay, isWithinInterval } from 'date-fns';

export const GRANOLA_API_V1 = 'https://api.granola.ai/v1';
export const GRANOLA_API_V2 = 'https://api.granola.ai/v2';

export async function getGranolaCredentials() {
  const credPath = path.join(os.homedir(), 'Library', 'Application Support', 'Granola', 'supabase.json');
  const credContent = await fs.readFile(credPath, 'utf8');
  const credentials = JSON.parse(credContent);

  if (!credentials.workos_tokens) {
    throw new Error('No workos_tokens found in Granola credentials');
  }

  const workosTokens = JSON.parse(credentials.workos_tokens);

  if (!workosTokens.access_token) {
    throw new Error('No access token found in workos_tokens');
  }

  return workosTokens.access_token;
}

export async function fetchDocumentTranscript(accessToken, documentId) {
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

export async function fetchGranolaNotes(accessToken, startDate, { includeTranscripts = true } = {}) {
  const response = await fetch(`${GRANOLA_API_V2}/get-documents`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      limit: 100,
      offset: 0,
      include_last_viewed_panel: true
    })
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  const responseData = await response.json();
  let data = responseData.docs || responseData || [];

  const start = startOfDay(parseISO(startDate));
  const end = endOfDay(new Date());

  const documents = data.documents || data.meetings || data.notes || data || [];
  const notesList = Array.isArray(documents) ? documents : [];

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

  if (includeTranscripts) {
    for (const note of filteredNotes) {
      if (note.id) {
        note.transcript = await fetchDocumentTranscript(accessToken, note.id);
      }
    }
  }

  return filteredNotes;
}
