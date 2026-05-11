document.addEventListener('DOMContentLoaded', async () => {
  const { apiUrl, token, firebaseApiKey, googleClientId } = await chrome.storage.local.get({
    apiUrl: 'http://localhost:8000',
    token: '',
    firebaseApiKey: 'AIzaSyAJZoUaHOeUam6rGosVDF3Q0lsZJTYrAL0',
    googleClientId: '',
  });

  document.getElementById('api-url').value = apiUrl;
  document.getElementById('token').value = token;
  document.getElementById('firebase-api-key').value = firebaseApiKey;
  document.getElementById('google-client-id').value = googleClientId;

  const redirectUrl = chrome.identity.getRedirectURL();
  document.getElementById('redirect-url').value = redirectUrl;

  document.getElementById('copy-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(redirectUrl);
    document.getElementById('copy-btn').textContent = 'Copied!';
    setTimeout(() => { document.getElementById('copy-btn').textContent = 'Copy'; }, 2000);
  });

  document.getElementById('settings-form').addEventListener('submit', async e => {
    e.preventDefault();
    await chrome.storage.local.set({
      apiUrl: document.getElementById('api-url').value.trim(),
      token: document.getElementById('token').value.trim(),
      firebaseApiKey: document.getElementById('firebase-api-key').value.trim(),
      googleClientId: document.getElementById('google-client-id').value.trim(),
    });
    const msg = document.getElementById('saved-msg');
    msg.classList.remove('hidden');
    setTimeout(() => msg.classList.add('hidden'), 2000);
  });
});
