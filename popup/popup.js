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
        const videoId = details.videoId || '';
        const url = window.location.href;

        let language = null;
        try {
          const player = document.querySelector('#movie_player');
          if (player && typeof player.getOption === 'function') {
            const track = player.getOption('captions', 'track');
            language = track?.languageCode || null;
          }
        } catch (_) {}

        // Fall back to first available caption track language
        if (!language) {
          const tracks =
            response?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
          if (tracks.length) language = tracks[0].languageCode;
        }

        return { title, author, videoId, url, language };
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

// Opens YouTube's built-in transcript panel and reads text from rendered DOM nodes.
// No HTTP requests — avoids all cookie/origin/format issues with the timedtext API.
async function loadTranscriptFromDOM(tabId) {
  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: async () => {
        const PANEL_SELECTOR =
          'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]';
        const SEGMENT_SELECTOR = 'ytd-transcript-segment-renderer';

        // Click "Show transcript" button if panel isn't open yet.
        const isVisible = el => {
          if (!el) return false;
          const s = el.getAttribute('visibility');
          return s === 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED';
        };

        let panel = document.querySelector(PANEL_SELECTOR);
        if (!isVisible(panel)) {
          // Find the "..." menu button on the video and open it
          const moreBtn = document.querySelector(
            'ytd-menu-renderer yt-icon-button[aria-label], ' +
            'ytd-video-primary-info-renderer ytd-menu-renderer button'
          );
          if (moreBtn) {
            moreBtn.click();
            await new Promise(r => setTimeout(r, 400));

            // Click "Show transcript" in the overflow menu
            const items = document.querySelectorAll('ytd-menu-service-item-renderer, yt-formatted-string');
            for (const item of items) {
              if (item.textContent.trim().toLowerCase().includes('transcript')) {
                item.click();
                break;
              }
            }
            await new Promise(r => setTimeout(r, 800));
          }
          panel = document.querySelector(PANEL_SELECTOR);
        }

        // Wait up to 3 s for segments to render
        let segments = [];
        for (let i = 0; i < 15; i++) {
          segments = Array.from(document.querySelectorAll(SEGMENT_SELECTOR));
          if (segments.length > 0) break;
          await new Promise(r => setTimeout(r, 200));
        }

        if (!segments.length) {
          return { _error: 'No transcript segments found. Enable captions on the video first.' };
        }

        const text = segments
          .map(seg => {
            const el = seg.querySelector('.segment-text, yt-formatted-string');
            return el ? el.textContent.trim() : '';
          })
          .filter(Boolean)
          .join(' ');

        return { text };
      },
    });
  } catch (err) {
    throw new Error(`Script injection failed: ${err.message}`);
  }

  const result = results?.[0]?.result;
  if (!result) throw new Error('No result from transcript DOM read.');
  if (result._error) throw new Error(result._error);
  return result.text;
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
      currentTranscript = await loadTranscriptFromDOM(tab.id);
    } catch (err) {
      showError(err.message);
      btn.disabled = false;
      btn.textContent = 'Load transcript';
      return;
    }

    btn.disabled = false;
    btn.textContent = 'Load transcript';
    $('preview').value =
      currentTranscript.slice(0, 400) + (currentTranscript.length > 400 ? '…' : '');
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
