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
        const log = (...args) => console.log('[lexplore]', ...args);

        const PANEL_SELECTOR =
          'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]';
        const SEGMENT_SELECTOR = 'ytd-transcript-segment-renderer';

        // 1. Check if transcript segments are already rendered
        let segments = Array.from(document.querySelectorAll(SEGMENT_SELECTOR));
        log('initial segment count:', segments.length);

        if (!segments.length) {
          const panel = document.querySelector(PANEL_SELECTOR);
          log('panel found:', !!panel, '| visibility:', panel?.getAttribute('visibility'));

          // 2. Find the overflow "⋮" button in the video info area.
          //    Selectors tried in priority order — YouTube layout varies by experiment.
          //    We never use a broad selector that could match like/dislike buttons.
          const overflowSelectors = [
            'ytd-video-primary-info-renderer ytd-menu-renderer yt-icon-button button',
            'ytd-watch-metadata ytd-menu-renderer yt-icon-button button',
            '#above-the-fold ytd-menu-renderer yt-icon-button button',
          ];

          let overflowBtn = null;
          for (const sel of overflowSelectors) {
            const el = document.querySelector(sel);
            log(`selector "${sel}":`, !!el);
            if (el) { overflowBtn = el; break; }
          }

          if (!overflowBtn) {
            log('overflow button not found');
            return {
              _error:
                'Could not find the More Actions (⋮) button. ' +
                'Open the transcript panel in YouTube manually (⋮ → Show transcript), then click Load again.',
            };
          }

          log('clicking overflow button');
          overflowBtn.click();
          await new Promise(r => setTimeout(r, 500));

          // 3. Find "Show transcript" in the dropdown
          const menuItems = document.querySelectorAll(
            'ytd-menu-popup-renderer ytd-menu-service-item-renderer, ' +
            'tp-yt-iron-dropdown ytd-menu-service-item-renderer'
          );
          log('dropdown items found:', menuItems.length);

          let transcriptItem = null;
          for (const item of menuItems) {
            const text = item.textContent.trim();
            log('  menu item:', JSON.stringify(text));
            if (text.toLowerCase().includes('transcript')) {
              transcriptItem = item;
              break;
            }
          }

          if (!transcriptItem) {
            log('transcript option not in menu — closing dropdown');
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            return {
              _error:
                'Show transcript option not found in the menu. ' +
                'Make sure captions are available for this video.',
            };
          }

          log('clicking transcript menu item');
          transcriptItem.click();
          await new Promise(r => setTimeout(r, 1000));
        }

        // 4. Poll for segments (up to 4 s)
        for (let i = 0; i < 20; i++) {
          segments = Array.from(document.querySelectorAll(SEGMENT_SELECTOR));
          log(`poll ${i + 1}: segments =`, segments.length);
          if (segments.length) break;
          await new Promise(r => setTimeout(r, 200));
        }

        if (!segments.length) {
          return {
            _error:
              'Transcript panel opened but no segments rendered. ' +
              'Try scrolling the panel or refreshing the page.',
          };
        }

        const text = segments
          .map(seg => {
            const el = seg.querySelector('.segment-text, yt-formatted-string');
            return el ? el.textContent.trim() : '';
          })
          .filter(Boolean)
          .join(' ');

        log('transcript chars:', text.length, '| preview:', text.slice(0, 80));
        return { text };
      },
    });
  } catch (err) {
    throw new Error(`Script injection failed: ${err.message}`);
  }

  const result = results?.[0]?.result;
  console.log('[lexplore] DOM result:', result?._error ?? `${result?.text?.length} chars`);
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
