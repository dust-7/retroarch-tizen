'use strict';

// set up TV controller
(() => {
  if (typeof tizen !== 'object') return;

  const canvas = document.getElementById('canvas');
  const tizenKeys = tizen.tvinputdevice.getSupportedKeys().map(key => key.name);
  const protectedKeys = ['Caption', 'ChannelList', 'Exit', 'Guide', 'VolumeDown', 'VolumeMute', 'VolumeUp'];
  const filteredKeys = tizenKeys.filter(key => !protectedKeys.includes(key));
  const fastKeys = ['XF86Red', 'XF86Green', 'XF86Yellow', 'XF86Blue', 'XF86Back', 'XF86PlayBack'];
  const missingCodes = {
    'XF86PlayBack': 'F1',
  };

  tizen.tvinputdevice.registerKeyBatch(filteredKeys);

  function remapKeys(event) {
    // some keys are undetected due to missing codes
    if (event.key in missingCodes) {
      Object.defineProperty(event, 'code', { value: missingCodes[event.key] });
    }

    // need to set delay for some keys to be detected
    if (fastKeys.includes(event.key) && event.type === 'keyup') {
      event.stopPropagation();

      setTimeout(() => {
        canvas.dispatchEvent(new KeyboardEvent('keyup', { code: event.code }));
      }, 100);
    }
  }

  document.addEventListener('keydown', remapKeys, true);
  document.addEventListener('keyup', remapKeys, true);
})();
