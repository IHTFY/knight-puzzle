'use strict';

// The ad in the solved dialog comes from the shared IHTFY loader, which
// ihtfy.com serves for all the games (its source is in the IHTFY/com.ihtfy
// repo). Nothing ad-related loads before the first finished run: the loader
// arrives then, and AdSense after it at browser idle.
const ADS_LOADER = 'https://ihtfy.com/ads/v1.js';

// The shared 300×250 display unit for the games' result screens.
const AD_SLOT = '6470163205';

let adLoader = null;

/** Fills `box` with an ad for the game over named `key`; offline or on failure it stays empty. */
function showAd(box, key) {
  if (!navigator.onLine) return;
  adLoader ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.src = ADS_LOADER;
    script.addEventListener('load', resolve);
    script.addEventListener('error', () => {
      script.remove();
      adLoader = null;
      reject(new Error('The ad loader did not load'));
    });
    document.head.appendChild(script);
  });
  adLoader.then(
    () => box.isConnected && window.ihtfyAds.show(box, key),
    () => {},
  );
}
