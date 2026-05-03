const DEBUG = true;

export const logger = {
  log(...args) {
    if (DEBUG) console.log(...args);
  },
  error(...args) {
    console.error(...args);
  },
  info(...args) {
    if (DEBUG) console.info(...args);
  },
  debug(...args) {
    if (DEBUG) console.debug(...args);
  }
};
