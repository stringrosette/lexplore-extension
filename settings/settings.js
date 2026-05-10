document.addEventListener('DOMContentLoaded', async () => {
  const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
  document.getElementById('api-url').value = settings.apiUrl || '';
  document.getElementById('token').value = settings.token || '';

  document.getElementById('settings-form').addEventListener('submit', async e => {
    e.preventDefault();
    await chrome.runtime.sendMessage({
      type: 'SAVE_SETTINGS',
      payload: {
        apiUrl: document.getElementById('api-url').value.trim(),
        token: document.getElementById('token').value.trim(),
      },
    });
    const msg = document.getElementById('saved-msg');
    msg.classList.remove('hidden');
    setTimeout(() => msg.classList.add('hidden'), 2000);
  });
});
