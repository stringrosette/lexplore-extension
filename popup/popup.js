const $ = id => document.getElementById(id);

const states = ['loading', 'error', 'ready', 'success'];
function showState(name) {
  states.forEach(s => $(`state-${s}`).classList.toggle('hidden', s !== name));
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

  // Get the active YouTube tab and request transcript
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.includes('youtube.com/watch')) {
    showError('Open a YouTube video page to use Lexplore.');
    return;
  }

  let data;
  try {
    data = await chrome.tabs.sendMessage(tab.id, { type: 'GET_TRANSCRIPT' });
  } catch {
    showError('Could not connect to the page. Try refreshing the YouTube tab.');
    return;
  }

  if (data?.error) {
    showError(data.error);
    return;
  }

  $('title-input').value = data.title;
  $('preview').value = data.transcript.slice(0, 300) + (data.transcript.length > 300 ? '…' : '');
  showState('ready');

  $('send-btn').addEventListener('click', async () => {
    const btn = $('send-btn');
    btn.disabled = true;
    btn.textContent = 'Sending…';

    const result = await chrome.runtime.sendMessage({
      type: 'SEND_TEXT',
      payload: {
        title: $('title-input').value.trim(),
        content: data.transcript,
        sourceUrl: data.url,
      },
    });

    if (result?.error) {
      showError(result.error);
      btn.disabled = false;
      btn.textContent = 'Send to Lexplore';
      return;
    }

    showState('success');
  });
});
