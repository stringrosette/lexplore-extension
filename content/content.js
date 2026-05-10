// Runs on youtube.com/watch* — extracts transcript and page metadata.

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_TRANSCRIPT') {
    extractTranscript()
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true; // keep message channel open for async response
  }
});

async function extractTranscript() {
  const videoId = new URLSearchParams(window.location.search).get('v');
  if (!videoId) throw new Error('No video ID found in URL');

  const title = document.title.replace(' - YouTube', '').trim();
  const url = window.location.href;

  const transcript = await fetchTranscriptViaApi(videoId);
  return { videoId, title, url, transcript };
}

async function fetchTranscriptViaApi(videoId) {
  // YouTube serves transcript data from timedtext endpoint.
  // We first need the page HTML to find the available caption tracks.
  const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
  const html = await pageRes.text();

  const captionsMatch = html.match(/"captionTracks":(\[.*?\])/);
  if (!captionsMatch) throw new Error('No captions found for this video');

  const tracks = JSON.parse(captionsMatch[1]);
  // Prefer English track, fall back to first available.
  const track =
    tracks.find(t => t.languageCode === 'en') ||
    tracks.find(t => t.languageCode?.startsWith('en')) ||
    tracks[0];

  if (!track) throw new Error('No usable caption track found');

  const xmlRes = await fetch(track.baseUrl);
  const xml = await xmlRes.text();
  return parseTranscriptXml(xml);
}

function parseTranscriptXml(xml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  const texts = Array.from(doc.querySelectorAll('text'));
  return texts
    .map(el => el.textContent.replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim())
    .filter(Boolean)
    .join(' ');
}
