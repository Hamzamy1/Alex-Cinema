/* Alex Cinema — Ad-blocking Service Worker */
const AD_RE = /googlesyndication|doubleclick|googleadservices|adservice\.google|adnxs\.com|taboola\.com|outbrain\.com|criteo\.(com|net)|pubmatic\.com|openx\.net|rubiconproject\.com|casalemedia\.com|sharethrough\.com|seedtag\.com|propellerads\.com|monetag\.com|adsterra\.(com|net)|hilltopads\.com|exoclick\.com|juicyads\.com|trafficjunky\.com|popads\.net|popcash\.net|bcvc\.net|trafficstars\.com|adskeeper\.com|mgid\.com|evadav\.com|galaksion\.com|ad-maven\.com|bidvertiser\.com|infolinks\.com|adcolony\.com|vungle\.com|unity3d\.com.*ads|applovin\.com.*ads|inmobi\.com|startapp\.com|appbrain\.com|amazon-adsystem\.com|adroll\.com|revcontent\.com|setupad\.com|adsco\.re|adthor\.com|adserv8\.com|pushnami\.com|clk\..*ads|trackpush\.com|getconat\.com|monetag\.com|adsfeed360\.com|mellowads\.com|yesadtraffic\.com|rtbsystem\.com|adstape\.com|adsinside\.com|adqit\.com|adspyreno\.com|adhealers\.com|crreed\.com|hitopad\.com|obzvil\.com|adsyan\.com|oos4l\.com|adlooks\.com|alxsite\.com|ad-maven\.com|ads2bid\.com|servesurge\.com|stariktok\.com|submitnet\.com|pop\.myway\.com|bundlestorage\.com|catchclickpop\.com|rapidglobalryfiles\.com|trking|netcitysrv\.com|googletagmanager\.com.*ads|ads\.twitter\.com|analytics\.twitter\.com|pixel\.facebook\.com/i;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (AD_RE.test(url)) {
    e.respondWith(new Response('', { status: 444, statusText: 'Blocked' }));
    return;
  }
});
