const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let mutationCallback;
let observed = false;
let intervals = 0;
let scans = 0;
const context = {
  console,
  window: { location: { href: 'https://example.com/' } },
  document: {
    createElement: () => ({}), head: { appendChild() {} }, body: {},
    dispatchEvent() {}, addEventListener() {}
  },
  chrome: {
    runtime: { getURL: x => x, onMessage: { addListener() {} } },
    storage: { local: { get: (keys, cb) => cb({}) }, onChanged: { addListener() {} } }
  },
  CustomEvent: function () {},
  MutationObserver: function (cb) {
    mutationCallback = cb;
    this.observe = () => { observed = true; };
  },
  setTimeout() {}, setInterval() { intervals++; }
};
vm.createContext(context);
const source = fs.readFileSync('content-core.js', 'utf8');
vm.runInContext(source, context);
assert.equal(observed, true, 'DOM observer must start');
const core = context.window.TAKCore;
core.registerPlatform('fixture', () => scans++);
mutationCallback();
assert.equal(scans, 1, 'DOM change must scan registered platforms');
vm.runInContext(source, context);
assert.equal(context.window.TAKCore, core, 'reinjection must preserve registry');
assert.equal(intervals, 1, 'reinjection must not duplicate timers');
console.log('Core regressions passed: observer, DOM scan, registry, timers');
