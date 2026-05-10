// Handles API communication with the Lexplore backend and transcript extraction.

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_LANGUAGES') {
    getLanguages()
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'GET_TRANSCRIPT') {
    fetchTranscript(message.baseUrl)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'SEND_TEXT') {
    sendToLexplore(message.payload)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'GET_SETTINGS') {
    getSettings().then(sendResponse);
    return true;
  }

  if (message.type === 'SAVE_SETTINGS') {
    saveSettings(message.payload).then(sendResponse);
    return true;
  }
});

// Reads ytInitialPlayerResponse directly from the page's JS context via
// executeScript (world: MAIN), which bypasses YouTube's CSP restrictions.
// Gets the active tab itself rather than trusting a tabId from the popup,
// which avoids issues when the service worker wakes from sleep.
async function getLanguages() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('No active tab found.');

  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: () => {
        const response = window.ytInitialPlayerResponse;
        if (!response) return { _error: 'ytInitialPlayerResponse not found — try refreshing the YouTube tab.' };
        const tracks =
          response?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
        return {
          title: document.title.replace(' - YouTube', '').trim(),
          url: window.location.href,
          tracks: tracks.map(t => ({
            languageCode: t.languageCode,
            languageName: t.name?.simpleText || t.languageCode,
            baseUrl: t.baseUrl,
          })),
        };
      },
    });
  } catch (err) {
    throw new Error(`Could not inject script: ${err.message}`);
  }

  const result = results?.[0]?.result;
  if (!result) throw new Error('No result from page script. Try refreshing the YouTube tab.');
  if (result._error) throw new Error(result._error);
  if (!result.tracks.length) throw new Error('No captions available for this video.');
  return result;
}

async function fetchTranscript(baseUrl) {
  const res = await fetch(baseUrl);
  if (!res.ok) throw new Error(`Failed to fetch transcript (${res.status})`);
  const xml = await res.text();
  return { transcript: parseTranscriptXml(xml) };
}

// DOMParser is unavailable in service workers — parse with regex instead.
function parseTranscriptXml(xml) {
  const texts = [];
  const re = /<text[^>]*>([\s\S]*?)<\/text>/g;
  let match;
  while ((match = re.exec(xml)) !== null) {
    const text = match[1]
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
    if (text) texts.push(text);
  }
  return texts.join(' ');
}

async function getSettings() {
  return chrome.storage.local.get({ apiUrl: 'http://localhost:8000', token: '' });
}

async function saveSettings(settings) {
  await chrome.storage.local.set(settings);
  return { ok: true };
}

async function sendToLexplore({ title, content, sourceUrl }) {
  const { apiUrl, token } = await getSettings();
  if (!token) throw new Error('No API token configured. Open Settings to add one.');

  const res = await fetch(`${apiUrl}/api/v1/texts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ title, content, source_url: sourceUrl }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`API error ${res.status}: ${detail}`);
  }

  return res.json();
}
