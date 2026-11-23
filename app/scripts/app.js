'use strict';

const app = (() => {
  let Module;
  const loadingScreen = document.getElementById('loading-screen');
  const cores = {
    dummy: { scriptUrl: 'retroarch.js', wasmUrl: 'retroarch.wasm' },
    // gambatte: { scriptUrl: 'gambatte_libretro.js', wasmUrl: 'gambatte_libretro.wasm' },
  };

  const ModuleBase = {
    noInitialRun: true,
    retroArchExit: (core, content) => {
      // "Quit"
      if (core === 0) {
        console.log('[APP] Exiting...');
        if (typeof tizen === 'object') tizen.application.getCurrentApplication().exit();

        return;
      }

      // "Restart"
      relaunch(core, content);
    },
    print: console.log,
    printErr: console.log,
    canvas: document.getElementById('canvas'),
  };

  async function loadCore(core = 'dummy', content = '--menu') {
    ModuleBase.arguments = ['-v', content, '-c', '/home/web_user/retroarch/userdata/retroarch.cfg'];
    ModuleBase.corePath = `/home/web_user/retroarch/cores/${core}_libretro.wasm`;
    ModuleBase.locateFile = () => cores[core].wasmUrl;

    // load core script
    if (typeof window[`libretro_${core}`] !== 'function') {
      const script = document.createElement('script');
      script.id = `${core}-script`;
      script.src = cores[core].scriptUrl;

      await new Promise((resolve) => {
        script.onload = resolve;
        document.body.appendChild(script);
      });
    }

    console.log('[APP] Initializing module...');

    await new Promise((resolve) => {
      Module = window[`libretro_${core}`](Object.assign({}, ModuleBase)).then(() => resolve());
    });

    console.log('[APP] Module initialized');
  }

  function reconnectGamepads() {
    let gamepads = navigator.getGamepads();
    if (typeof gamepads === 'object') gamepads = Object.values(gamepads); // tizen quirk

    gamepads.forEach(gamepad => {
      if (!gamepad) return;

      const event = new Event('gamepadconnected');
      event.gamepad = gamepad;
      window.dispatchEvent(event);
    });
  }

  async function relaunch(corePath, content) {
    loadingScreen.classList.add('active');

    if (!corePath) corePath = ModuleBase.corePath;
    if (!content) content = '--menu';

    // parse core name from full path ("/home/web_user/retroarch/cores/NAME_libretro.wasm")
    const core = corePath.split('/').pop().replace('_libretro.wasm', '');

    // read core files before nullifying Module
    if (!cores[core]) {
      cores[core] = {};

      const scriptData = Module.FS.readFile(`/home/web_user/retroarch/cores/${core}_libretro.js`);
      const scriptBlob = new Blob([scriptData], { type: 'text/javascript' });
      cores[core].scriptUrl = URL.createObjectURL(scriptBlob);

      const wasmData = Module.FS.readFile(`/home/web_user/retroarch/cores/${core}_libretro.wasm`);
      const wasmBlob = new Blob([wasmData], { type: 'application/wasm' });
      cores[core].wasmUrl = URL.createObjectURL(wasmBlob);
    }

    Module = null;
    await loadCore(core, content);
    fsManager.mount(Module);
    Module.callMain(Module.arguments);
    reconnectGamepads();
    loadingScreen.classList.remove('active');
  }

  // returns a reference to the current Module
  function getModule() {
    return Module;
  }

  (async () => {
    await Promise.all([
      loadCore(),
      fsManager.init(),
    ]);

    fsManager.mount(Module);

    console.log('[APP] filesystem initialization successful');

    Module.callMain(Module.arguments);

    // for some unknown reason, setting LIBRARY_PATH in preRun causes some retroarch.cfg paths to be generated wrongly,
    // so only set it after at least one Module.callMain()
    ModuleBase.preRun = () => {
      Module.ENV['LIBRARY_PATH'] = Module.corePath;
    };

    loadingScreen.classList.remove('active');

    // run this last so it does not block UI
    try {
      await externalStorage.init(Module.FS);
    } catch (error) {
      console.error('Failed to initialize external storage', error);
    }
  })();

  return {
    getModule,
  };
})();
