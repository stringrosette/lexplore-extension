// Intercepts YouTube's timedtext API requests as the player fetches them.
// The captured URL (complete with auth tokens) is stored per tab so the popup
// can replay it from the YouTube tab context without any DOM manipulation.
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    chrome.storage.session
      .set({ [`transcript_${details.tabId}`]: details.url })
      .catch(() => {});
  },
  { urls: ['*://www.youtube.com/api/timedtext*'], types: ['xmlhttprequest', 'other'] }
);
