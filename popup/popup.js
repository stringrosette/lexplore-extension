// All logic runs directly in the popup page — no service worker message passing,
// which eliminates the MV3 race condition where the SW isn't awake yet.

const $ = id => document.getElementById(id);

const STATES = ['loading', 'error', 'languages', 'fetching', 'ready', 'success'];
function showState(name) {
  STATES.forEach(s => $(`state-${s}`).classList.toggle('hidden', s !== name));
}

function showError(msg) {
  $('state-error').querySelector('.error-msg').textContent = msg;
  showState('error');
}

async function getLanguages(tabId) {
  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        const response = window.ytInitialPlayerResponse;
        if (!response) return { _error: 'No player data found — try refreshing the YouTube tab.' };
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
    throw new Error(`Script injection failed: ${err.message}`);
  }

  const result = results?.[0]?.result;
  if (!result) throw new Error('Could not read page data. Try refreshing the YouTube tab.');
  if (result._error) throw new Error(result._error);
  if (!result.tracks.length) throw new Error('No captions available for this video.');
  return result;
}

async function fetchTranscript(baseUrl) {
  const res = await fetch(baseUrl);
  if (!res.ok) throw new Error(`Failed to fetch transcript (${res.status})`);
  const xml = await res.text();
  return parseTranscriptXml(xml);
}

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

async function sendToLexplore({ title, content, sourceUrl }) {
  const { apiUrl, token } = await chrome.storage.local.get({
    apiUrl: 'http://localhost:8000',
    token: '',
  });

  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${apiUrl}/api/v1/texts`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title, content, source_url: sourceUrl }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`API error ${res.status}: ${detail}`);
  }

  return res.json();
}

document.addEventListener('DOMContentLoaded', async () => {
  $('settings-link').addEventListener('click', e => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.includes('youtube.com/watch')) {
    showError('Open a YouTube video page to use Lexplore.');
    return;
  }

  // Step 1: detect available transcript languages
  let langData;
  try {
    langData = await getLanguages(tab.id);
  } catch (err) {
    showError(err.message);
    return;
  }

  const { title, url, tracks } = langData;
  const select = $('lang-select');
  tracks.forEach(track => {
    const option = document.createElement('option');
    option.value = track.baseUrl;
    option.textContent = track.languageName;
    if (track.languageCode === 'en') option.selected = true;
    select.appendChild(option);
  });
  showState('languages');

  // Step 2: load transcript for selected language
  $('load-btn').addEventListener('click', async () => {
    showState('fetching');

    let transcript;
    try {
      transcript = await fetchTranscript(select.value);
    } catch (err) {
      showError(err.message);
      return;
    }

    $('title-input').value = title;
    $('preview').value = transcript.slice(0, 400) + (transcript.length > 400 ? '…' : '');
    showState('ready');

    // Step 3: send to Lexplore
    $('send-btn').addEventListener('click', async () => {
      const btn = $('send-btn');
      btn.disabled = true;
      btn.textContent = 'Sending…';

      try {
        await sendToLexplore({
          title: $('title-input').value.trim(),
          content: transcript,
          sourceUrl: url,
        });
        showState('success');
      } catch (err) {
        showError(err.message);
        btn.disabled = false;
        btn.textContent = 'Send to Lexplore';
      }
    });
  });
});
