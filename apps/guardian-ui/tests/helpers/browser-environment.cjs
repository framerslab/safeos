const { TestEnvironment } = require('jest-environment-jsdom');

module.exports = class BrowserEnvironment extends TestEnvironment {
  constructor(...args) {
    super(...args);
    Object.assign(this.global, { Response, Request, Headers, fetch });
  }
};
