document.addEventListener('DOMContentLoaded', async () => {
  const { apiUrl, token } = await chrome.storage.local.get({
    apiUrl: 'http://localhost:8000',
    token: '',
  });
  document.getElementById('api-url').value = apiUrl;
  document.getElementById('token').value = token;

  document.getElementById('settings-form').addEventListener('submit', async e => {
    e.preventDefault();
    await chrome.storage.local.set({
      apiUrl: document.getElementById('api-url').value.trim(),
      token: document.getElementById('token').value.trim(),
    });
    const msg = document.getElementById('saved-msg');
    msg.classList.remove('hidden');
    setTimeout(() => msg.classList.add('hidden'), 2000);
  });
});
