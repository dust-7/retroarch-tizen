'use strict';

(() => {
  const main = document.getElementById('main');
  const logContainer = document.createElement('pre');
  logContainer.id = 'log-container';
  const MAX_LOGS = 100;

  let previousMessage = '';
  let isRepeated = false;
  let logQueue = [];
  let isUpdatePending = false;
  let isShown = false;

  function addLog(message) {
    if (message === previousMessage && isRepeated) return;

    if (message === previousMessage) {
      isRepeated = true;
      logQueue.push('[LOGGER] Silenced repeated message(s)');
    } else {
      previousMessage = message;
      isRepeated = false;

      logQueue.push(message);
    }

    if (!isUpdatePending) {
      isUpdatePending = true;
      requestAnimationFrame(flushQueue);
    }
  }

  function flushQueue() {
    const fragment = document.createDocumentFragment();

    logQueue.forEach(msg => {
      const line = document.createElement('div');
      line.textContent = msg;
      fragment.appendChild(line);
    });

    logContainer.appendChild(fragment);
    logQueue = [];
    isUpdatePending = false;

    while (logContainer.children.length > MAX_LOGS) {
      logContainer.removeChild(logContainer.firstChild);
    }

    logContainer.scrollTop = logContainer.scrollHeight;
  }

  const originalLog = console.log;
  console.log = function (...args) {
    originalLog.apply(console, args);
    const text = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
    addLog(text);
  };

  const originalError = console.error;
  console.error = function (...args) {
    originalError.apply(console, args);
    const text = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
    addLog(text);
  };

  window.onerror = function (message, source, lineno, colno, _error) {
    const text = `Uncaught Error: ${message} (at ${source}:${lineno}:${colno}\n)`;
    addLog(text);

    return false;
  };

  window.addEventListener('unhandledrejection', event => {
    const text = `Unhandled rejection: ${event.reason && event.reason.message || event.reason}`;
    addLog(text);
  });

  // toggle log container
  document.addEventListener('keydown', (event) => {
    // bind to "~" and Info button
    if (!['~', 'XF86Info'].includes(event.key)) return;

    if (isShown) {
      main.removeChild(logContainer);
      isShown = false;
    } else {
      main.appendChild(logContainer);
      logContainer.scrollTop = logContainer.scrollHeight;
      isShown = true;
    }
  });
})();
