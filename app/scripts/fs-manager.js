'use strict';

const fsManager = (() => {
  async function zipfsInit() {
    // 256 MB max bundle size
    const buffer = new ArrayBuffer(256 * 1024 * 1024);
    const bufferView = new Uint8Array(buffer);
    let idx = 0;
    const zipFile = await fetch('assets/frontend/bundle.zip');
    const buf = await zipFile.arrayBuffer();

    if (idx + buf.byteLength > buffer.maxByteLength) {
      console.error('[FS] error: bundle.zip is too large');
    }
    bufferView.set(new Uint8Array(buf), idx, buf.byteLength);
    idx += buf.byteLength;

    const zipBuffer = BrowserFS.BFSRequire('buffer').Buffer(new Uint8Array(buffer, 0, idx));

    return await new Promise((resolve) => {
      BrowserFS.FileSystem.ZipFS.Create({ zipData: zipBuffer }, (e, fs) => {
        if (e) throw new Error(`[FS] error (zipfs): ${e}`);

        console.log('[FS] zipfs setup successful');

        resolve(fs);
      });
    });
  }

  async function idbfsInit() {
    if (!BrowserFS.FileSystem.IndexedDB.isAvailable()) throw new Error('[FS] idbfs not available');

    return await new Promise((resolve) => {
      BrowserFS.FileSystem.IndexedDB.Create({ storeName: 'RetroArch' }, (e, idbfs) => {
        if (e) throw new Error(`[FS] error (idbfs): ${e}`);

        // initialize afs by copying files from async storage to sync storage.
        const imfs = new BrowserFS.FileSystem.InMemory();
        BrowserFS.FileSystem.AsyncMirror.Create({ sync: imfs, async: idbfs }, (e, fs) => {
          if (e) throw new Error(`[FS] error (afs): ${e}`);

          console.log('[FS] idbfs setup successful');

          resolve(fs);
        });
      });
    });
  }

  async function ofsInit() {
    const [zipfs, afs] = await Promise.all([zipfsInit(), idbfsInit()]);

    return await new Promise((resolve) => {
      BrowserFS.FileSystem.OverlayFS.Create({ readable: zipfs, writable: afs }, (e, fs) => {
        if (e) throw new Error(`[FS] error (ofs): ${e}`);

        console.log('[FS] ofs setup successful');

        resolve(fs);
      });
    });
  }

  async function init() {
    const ofs = await ofsInit();
    const mfs = new BrowserFS.FileSystem.MountableFileSystem();

    mfs.mount('/home/web_user/retroarch', ofs);
    mfs.mount('/mnt', new BrowserFS.FileSystem.InMemory());
    BrowserFS.initialize(mfs);
  }

  function mount(Module) {
    const BFS = new BrowserFS.EmscriptenFS(Module.FS, Module.PATH, Module.ERRNO_CODES);
    Module.FS.mount(BFS, { root: '/home' }, '/home');
    Module.FS.mkdir('/mnt');
    Module.FS.mount(BFS, { root: '/mnt' }, '/mnt');
  }

  return {
    init,
    mount,
  };
})();
