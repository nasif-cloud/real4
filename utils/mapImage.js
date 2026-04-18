const MAP_URLS = {
  fusha_village: 'https://files.catbox.moe/c9kjgd.webp',
  alvidas_hideout: 'https://files.catbox.moe/54sd93.webp',
  shells_town: 'https://files.catbox.moe/hz5htx.webp',
  orange_town: 'https://files.catbox.moe/pid7tj.webp',
  syrup_village: 'https://files.catbox.moe/j5w72l.webp',
  baratie: 'https://files.catbox.moe/iq5060.webp',
  arlong_park: 'https://files.catbox.moe/h81mo6.webp',
  all_unlocked: 'https://files.catbox.moe/a0cyz2.webp'
};

const ISLAND_ORDER = [
  'fusha_village', 'alvidas_hideout', 'shells_town', 'orange_town', 'syrup_village', 'baratie', 'arlong_park', 'loguetown'
];

async function fetchBuffer(url) {
  if (!url) throw new Error('No URL provided');
  const globalFetch = (typeof fetch === 'function') ? fetch : null;
  if (!globalFetch) throw new Error('fetch is not available in this environment');
  const res = await globalFetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image ${url}: ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

function getMapImageUrl(user) {
  const storyProgress = (user && user.storyProgress) || {};

  for (const id of ISLAND_ORDER) {
    const prog = storyProgress[id];
    if (!Array.isArray(prog) || prog.length === 0) {
      // user hasn't started this island yet -> show that island
      return MAP_URLS[id] || MAP_URLS.all_unlocked;
    }
    // if user hasn't completed boss (stage 3) yet, show that island image
    if (!prog.includes(3)) return MAP_URLS[id] || MAP_URLS.all_unlocked;
  }
  // everything complete
  return MAP_URLS.all_unlocked;
}

async function getMapImageBuffer(user) {
  const url = getMapImageUrl(user);
  return fetchBuffer(url);
}

module.exports = { getMapImageUrl, getMapImageBuffer, fetchBuffer };
