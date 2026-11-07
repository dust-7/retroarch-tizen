'use strict';

const externalStorage = (() => {
  let moduleFS;

  const tizenFS = {
    listDirectory: (path, filter = {}) => {
      return new Promise((resolve, reject) => {
        tizen.filesystem.listDirectory(path, (names, path) => resolve([names, path]), reject, filter);
      });
    },

    listStorages: () => {
      return new Promise((resolve, reject) => {
        tizen.filesystem.listStorages(resolve, reject);
      });
    },
  };

  async function copyTizenFile(tizenFile, moduleFile) {
    const chunkSize = 1024 * 1024; // 1 MiB
    const chunk = await new Promise((resolve, reject) => {
      tizenFile.readDataNonBlocking(resolve, reject, chunkSize);
    });

    // EOF
    if (chunk.length === 0) {
      tizenFile.closeNonBlocking();
      moduleFS.close(moduleFile);

      return;
    }

    moduleFS.write(moduleFile, chunk, 0, chunk.length);

    await copyTizenFile(tizenFile, moduleFile);
  }

  async function copyTizenDir(tizenPath, modulePath) {
    const [names, path] = await tizenFS.listDirectory(tizenPath);

    for (const name of names) {
      const tizenFullPath = `${path}/${name}`;
      const moduleFullPath = `${modulePath}/${name}`;
      const info = moduleFS.analyzePath(moduleFullPath);

      if (tizen.filesystem.isFile(tizenFullPath)) {
        if (info.exists) continue;

        const tizenFile = tizen.filesystem.openFile(tizenFullPath, 'r');
        const moduleFile = moduleFS.open(moduleFullPath, 'w');

        await copyTizenFile(tizenFile, moduleFile);
      } else {
        if (!info.exists) moduleFS.mkdir(moduleFullPath);
        await copyTizenDir(tizenFullPath, moduleFullPath);
      }
    }
  }

  function removeModuleDir(modulePath, tizenPath) {
    const entries = moduleFS.readdir(modulePath).filter(entry => !['.', '..'].includes(entry));

    entries.forEach(entry => {
      const moduleFullPath = `${modulePath}/${entry}`;
      const tizenFullPath = tizenPath ? `${tizenPath}/${entry}` : undefined;
      const info = moduleFS.analyzePath(moduleFullPath);
      if (!info.exists) return;

      if (moduleFS.isFile(info.object.mode)) {
        if (tizenPath && tizen.filesystem.pathExists(tizenFullPath) && tizen.filesystem.isFile(tizenFullPath)) return;

        moduleFS.unlink(moduleFullPath);
      } else {
        removeModuleDir(moduleFullPath, tizenFullPath);
      }
    });

    if (tizenPath && tizen.filesystem.pathExists(tizenPath) && tizen.filesystem.isDirectory(tizenPath)) return;

    moduleFS.rmdir(modulePath);
  }

  let hasSyncedPersistDir = false;

  async function mountStorage(storage, isSyncOnce = false) {
    // check for persistent directory
    const [persistDirs, path] = await tizenFS.listDirectory(storage.label, { name: 'retroarch', isDirectory: true });

    if (persistDirs.length > 0) {
      // when processing list of storages, do not sync subsequent persistent dirs
      if (isSyncOnce && hasSyncedPersistDir) return;

      console.log('[EXT-STO] Syncing persistent directory');
      hasSyncedPersistDir = true;
      const persistDestPath = '/home/web_user/retroarch/userdata/content';
      const tizenPath = `${path}/${persistDirs[0]}`;

      removeModuleDir(persistDestPath, tizenPath);
      await copyTizenDir(tizenPath, persistDestPath);
      console.log('[EXT-STO] Synced persistent directory');

      return;
    }

    // mount storage to /mnt/
    const storagePath = `/mnt/${storage.label}`;

    console.log('[EXT-STO] Mounting external storage', storagePath);
    moduleFS.mkdir(storagePath);
    await copyTizenDir(storage.label, storagePath);
    console.log('[EXT-STO] Mounted external storage', storagePath);
  }

  async function init(fs) {
    if (typeof tizen !== 'object') return;

    moduleFS = fs;

    tizen.filesystem.addStorageStateChangeListener(async (storage) => {
      if (storage.type !== 'EXTERNAL') return;

      const storagePath = `/mnt/${storage.label}`;
      const Module = app.getModule();

      // Module can be null when app is relaunching
      if (!Module) return;

      switch (storage.state) {
        case 'MOUNTED':
          await mountStorage(storage);

          break;
        case 'REMOVED':
        case 'UNMOUNTABLE':
          moduleFS = Module.FS;
          const info = moduleFS.analyzePath(storagePath);
          if (!info.exists) break;

          console.log('[EXT-STO] Unmounting external storage', storagePath);
          removeModuleDir(storagePath);
          console.log('[EXT-STO] Unmounted external storage', storagePath);

          break;
      }
    });

    const storages = await tizenFS.listStorages();

    for (const storage of storages) {
      if (!(storage.type === 'EXTERNAL' && storage.state === 'MOUNTED')) continue;

      await mountStorage(storage, true);
    }
  }

  return {
    init,
  };
})();
