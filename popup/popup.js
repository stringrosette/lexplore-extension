const $ = id => document.getElementById(id);

const STATES = ['loading', 'error', 'languages', 'fetching', 'ready', 'success'];
function showState(name) {
  STATES.forEach(s => $(`state-${s}`).classList.toggle('hidden', s !== name));
}

function showError(msg) {
  $('state-error').querySelector('.error-msg').textContent = msg;
  showState('error');
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
  const langResult = await chrome.runtime.sendMessage({ type: 'GET_LANGUAGES' });

  if (!langResult) {
    showError('No response from extension background. Close and reopen the popup.');
    return;
  }
  if (langResult.error) { showError(langResult.error); return; }

  const { title, url, tracks } = langResult;
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

    const transcriptResult = await chrome.runtime.sendMessage({
      type: 'GET_TRANSCRIPT',
      baseUrl: select.value,
    });

    if (transcriptResult?.error) { showError(transcriptResult.error); return; }

    const { transcript } = transcriptResult;
    $('title-input').value = title;
    $('preview').value = transcript.slice(0, 400) + (transcript.length > 400 ? '…' : '');
    showState('ready');

    // Step 3: send to Lexplore
    $('send-btn').addEventListener('click', async () => {
      const btn = $('send-btn');
      btn.disabled = true;
      btn.textContent = 'Sending…';

      const sent = await chrome.runtime.sendMessage({
        type: 'SEND_TEXT',
        payload: {
          title: $('title-input').value.trim(),
          content: transcript,
          sourceUrl: url,
        },
      });

      if (sent?.error) {
        showError(sent.error);
        btn.disabled = false;
        btn.textContent = 'Send to Lexplore';
        return;
      }

      showState('success');
    });
  });
});
