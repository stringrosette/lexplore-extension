// Handles API communication with the Lexplore backend.

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
