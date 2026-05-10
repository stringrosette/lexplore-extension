// All logic runs directly in the popup page — no service worker message passing,
// which eliminates the MV3 race condition where the SW isn't awake yet.

const $ = id => document.getElementById(id);

const STATES = ['loading', 'error', 'main', 'success'];
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

// Fetch runs inside the YouTube tab so it carries the page's cookies and
// origin — fetching from the extension popup context returns an empty body.
async function fetchTranscript(tabId, baseUrl) {
  console.log('[lexplore] fetchTranscript url:', baseUrl);
  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: async (url) => {
        try {
          const res = await fetch(url);
          console.log('[lexplore-page] fetch status:', res.status);
          if (!res.ok) return { _error: `HTTP ${res.status}` };
          const xml = await res.text();
          console.log('[lexplore-page] xml length:', xml.length);
          return { xml };
        } catch (err) {
          return { _error: err.message };
        }
      },
      args: [baseUrl],
    });
  } catch (err) {
    throw new Error(`Script injection failed: ${err.message}`);
  }

  const result = results?.[0]?.result;
  console.log('[lexplore] fetchTranscript result:', result);
  if (!result) throw new Error('No result from transcript fetch.');
  if (result._error) throw new Error(`Failed to fetch transcript: ${result._error}`);

  const transcript = parseTranscriptXml(result.xml);
  console.log('[lexplore] parsed transcript length:', transcript.length, '| first 200 chars:', transcript.slice(0, 200));
  return transcript;
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
  $('version').textContent = `v${chrome.runtime.getManifest().version}`;

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
    console.error('[lexplore] getLanguages error:', err);
    showError(err.message);
    return;
  }
  console.log('[lexplore] langData:', langData);

  const { title, url, tracks } = langData;
  const select = $('lang-select');
  tracks.forEach(track => {
    const option = document.createElement('option');
    option.value = track.baseUrl;
    option.textContent = track.languageName;
    if (track.languageCode === 'en') option.selected = true;
    select.appendChild(option);
  });
  showState('main');

  let currentTranscript = null;

  // Step 2: load transcript for selected language (re-runnable on language change)
  async function loadTranscript() {
    const btn = $('load-btn');
    btn.disabled = true;
    btn.textContent = 'Loading…';
    $('transcript-section').classList.add('hidden');

    try {
      currentTranscript = await fetchTranscript(tab.id, select.value);
    } catch (err) {
      showError(err.message);
      return;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Load';
    }

    $('title-input').value = title;
    $('preview').value =
      currentTranscript.slice(0, 400) + (currentTranscript.length > 400 ? '…' : '');
    $('transcript-section').classList.remove('hidden');
  }

  $('load-btn').addEventListener('click', loadTranscript);

  // Step 3: send to Lexplore
  $('send-btn').addEventListener('click', async () => {
    const btn = $('send-btn');
    btn.disabled = true;
    btn.textContent = 'Sending…';

    try {
      await sendToLexplore({
        title: $('title-input').value.trim(),
        content: currentTranscript,
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
