// All logic runs directly in the popup page — no service worker message passing,
// which eliminates the MV3 race condition where the SW isn't awake yet.

const $ = id => document.getElementById(id);

const STATES = ['loading', 'error', 'main', 'success', 'login'];
function showState(name) {
  STATES.forEach(s => $(`state-${s}`).classList.toggle('hidden', s !== name));
}

function showError(msg) {
  $('state-error').querySelector('.error-msg').textContent = msg;
  showState('error');
}

// Reads video metadata and the currently active caption language from the YouTube player.
async function getPageData(tabId) {
  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        const response = window.ytInitialPlayerResponse;
        if (!response) return { _error: 'No player data found — try refreshing the YouTube tab.' };

        const details = response.videoDetails || {};
        const title = details.title || document.title.replace(' - YouTube', '').trim();
        const author = details.author || '';
        const url = window.location.href;

        let language = null;
        try {
          const player = document.querySelector('#movie_player');
          if (player && typeof player.getOption === 'function') {
            const track = player.getOption('captions', 'track');
            language = track?.languageCode || null;
          }
        } catch (_) {}

        if (!language) {
          const tracks =
            response?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
          if (tracks.length) language = tracks[0].languageCode;
        }

        return { title, author, url, language };
      },
    });
  } catch (err) {
    throw new Error(`Script injection failed: ${err.message}`);
  }

  const result = results?.[0]?.result;
  if (!result) throw new Error('Could not read page data. Try refreshing the YouTube tab.');
  if (result._error) throw new Error(result._error);
  return result;
}

// Replays the timedtext URL that was captured by the service worker's webRequest
// listener. Runs the fetch inside the YouTube tab so it carries the page's
// cookies and origin — fetching from the popup context returns an empty body.
async function fetchTranscriptFromUrl(tabId, url) {
  console.log('[lexplore] replaying captured url:', url.slice(0, 120));

  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: async (u) => {
        const log = (...a) => console.log('[lexplore-page]', ...a);
        try {
          const res = await fetch(u);
          log('status:', res.status);
          if (!res.ok) return { _error: `HTTP ${res.status}` };
          const text = await res.text();
          log('length:', text.length, '| preview:', text.slice(0, 120));
          return { text };
        } catch (err) {
          return { _error: err.message };
        }
      },
      args: [url],
    });
  } catch (err) {
    throw new Error(`Script injection failed: ${err.message}`);
  }

  const result = results?.[0]?.result;
  console.log('[lexplore] fetch result:', result?._error ?? `${result?.text?.length} chars`);
  if (!result) throw new Error('No result from transcript fetch.');
  if (result._error) throw new Error(`Failed to fetch transcript: ${result._error}`);
  return parseTranscript(result.text);
}

function formatSegments(segments) {
  return segments
    .map(({ startMs, text }) => {
      const totalSecs = Math.floor(startMs / 1000);
      const mins = Math.floor(totalSecs / 60);
      const secs = totalSecs % 60;
      return `[${mins}:${secs.toString().padStart(2, '0')}] ${text}`;
    })
    .join('\n');
}

function parseTranscript(text) {
  try {
    const data = JSON.parse(text);
    const segments = [];
    for (const event of data.events || []) {
      if (!event.segs) continue;
      const line = event.segs.map(s => s.utf8 || '').join('').replace(/\n/g, ' ').trim();
      if (line) segments.push({ startMs: event.tStartMs || 0, text: line });
    }
    if (segments.length) {
      console.log('[lexplore] parsed as JSON3, segments:', segments.length);
      return formatSegments(segments);
    }
  } catch {}
  console.log('[lexplore] falling back to XML parser');
  return parseTranscriptXml(text);
}

function parseTranscriptXml(xml) {
  const segments = [];
  const re = /<text[^>]*\bstart="([^"]*)"[^>]*>([\s\S]*?)<\/text>/g;
  let match;
  while ((match = re.exec(xml)) !== null) {
    const startMs = Math.round(parseFloat(match[1]) * 1000);
    const decoded = match[2]
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
    if (decoded) segments.push({ startMs, text: decoded });
  }
  console.log('[lexplore] XML parsed, segments:', segments.length);
  return formatSegments(segments);
}

async function sendToLexplore({ title, content, url, language }) {
  const { apiUrl, token } = await chrome.storage.local.get({
    apiUrl: 'http://localhost:8000',
    token: '',
  });

  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${apiUrl}/api/v1/texts`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title, content, url, language, text_type: 'script' }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`API error ${res.status}: ${detail}`);
  }

  return res.json();
}

async function showLoginState() {
  const { token, userEmail } = await chrome.storage.local.get({ token: '', userEmail: '' });
  if (token) {
    $('login-form').classList.add('hidden');
    $('login-status').classList.remove('hidden');
    $('login-email-display').textContent = userEmail || 'Signed in';
  } else {
    $('login-form').classList.remove('hidden');
    $('login-status').classList.add('hidden');
    $('login-error').classList.add('hidden');
    $('email-input').value = '';
    $('password-input').value = '';
  }
  showState('login');
}

document.addEventListener('DOMContentLoaded', async () => {
  $('version').textContent = `v${chrome.runtime.getManifest().version}`;

  // Reflect auth state in the account button on load
  const { token: initialToken } = await chrome.storage.local.get({ token: '' });
  if (initialToken) $('account-btn').classList.add('logged-in');

  // Account button toggles login state
  $('account-btn').addEventListener('click', async () => {
    const onLogin = !$('state-login').classList.contains('hidden');
    if (onLogin) {
      showState('main');
    } else {
      await showLoginState();
    }
  });

  // Login form submit
  $('login-submit-btn').addEventListener('click', async () => {
    const btn = $('login-submit-btn');
    const email = $('email-input').value.trim();
    const password = $('password-input').value;
    const errorEl = $('login-error');

    errorEl.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'Signing in…';

    try {
      const { apiUrl } = await chrome.storage.local.get({ apiUrl: 'http://localhost:8000' });
      const res = await fetch(`${apiUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username: email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Server error ${res.status}`);
      }

      const data = await res.json();
      await chrome.storage.local.set({ token: data.access_token, userEmail: email });
      $('account-btn').classList.add('logged-in');
      showState('main');
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  });

  // Sign out
  $('logout-btn').addEventListener('click', async () => {
    await chrome.storage.local.set({ token: '', userEmail: '' });
    $('account-btn').classList.remove('logged-in');
    showState('main');
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.includes('youtube.com/watch')) {
    showError('Open a YouTube video page to use Lexplore.');
    return;
  }

  let pageData;
  try {
    pageData = await getPageData(tab.id);
  } catch (err) {
    showError(err.message);
    return;
  }

  const { title, author, url, language } = pageData;
  $('title-input').value = title;
  $('author-display').textContent = author || '—';
  $('lang-display').textContent = language || 'unknown';
  showState('main');

  let currentTranscript = null;

  async function loadTranscript() {
    const btn = $('load-btn');
    btn.disabled = true;
    btn.textContent = 'Loading…';
    $('transcript-section').classList.add('hidden');

    try {
      const stored = await chrome.storage.session.get(`transcript_${tab.id}`);
      const transcriptUrl = stored[`transcript_${tab.id}`];
      console.log('[lexplore] stored url:', transcriptUrl ? transcriptUrl.slice(0, 80) : 'none');

      if (!transcriptUrl) {
        throw new Error(
          'No transcript captured yet. Enable captions on the video, wait a moment, then try again.'
        );
      }

      currentTranscript = await fetchTranscriptFromUrl(tab.id, transcriptUrl);
    } catch (err) {
      showError(err.message);
      btn.disabled = false;
      btn.textContent = 'Load transcript';
      return;
    }

    btn.disabled = false;
    btn.textContent = 'Load transcript';
    const lines = currentTranscript.split('\n');
    $('preview').value = lines.slice(0, 8).join('\n') + (lines.length > 8 ? '\n…' : '');
    $('transcript-section').classList.remove('hidden');
  }

  $('load-btn').addEventListener('click', loadTranscript);

  $('send-btn').addEventListener('click', async () => {
    const btn = $('send-btn');
    btn.disabled = true;
    btn.textContent = 'Sending…';

    try {
      await sendToLexplore({
        title: $('title-input').value.trim(),
        content: currentTranscript,
        url,
        language,
      });
      showState('success');
    } catch (err) {
      showError(err.message);
      btn.disabled = false;
      btn.textContent = 'Send to Lexplore';
    }
  });
});
