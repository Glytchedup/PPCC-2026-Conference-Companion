const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
const root = process.argv[2] || path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(root, 'public/data.json'), 'utf8'));
function harness(D = data, events = []) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: '', textContent: '', addEventListener() {}, classList: { toggle() {} }, querySelector() { return { showModal() {}, focus() {} }; } });
    return nodes.get(id);
  };
  const mem = new Map([['ppcc2026.events.v1', JSON.stringify(events)]]);
  const context = vm.createContext({
    window: { PPCC_DATA: D, addEventListener() {} },
    document: { addEventListener() {}, querySelector: node },
    localStorage: { getItem: k => mem.get(k) || null, setItem: (k, v) => mem.set(k, v) },
    location: { hostname: 'test.example', origin: 'https://test.example', hash: '' },
    crypto: webcrypto, URL, console, confirm: () => true,
    setTimeout() {}, setInterval() {}, fetch() { throw Error('Unexpected network access'); }
  });
  const hooks = 'render=()=>{};toast=()=>{};window.TEST={snapshot,catalogForDay,optionsFor,activeItem,swapModal,selectedEntries,findResults,addToSchedule,removeFromSchedule,setFind:(d,t)=>{day=d;findTime=t;findQuery="";findGuide=false;findLimit=1000;}};';
  assert.ok(source.includes('setup();\n})();'), 'App entry point found');
  vm.runInContext(source.replace('setup();\n})();', hooks + '\n})();'), context);
  return { app: context.window.TEST, html: id => node(id).innerHTML, reload: () => harness(D, JSON.parse(mem.get('ppcc2026.events.v1'))) };
}
const norm = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
let failed = 0;
function test(name, run) { try { run(); console.log('PASS ' + name); } catch (e) { failed++; console.error('FAIL ' + name + ': ' + e.message); } }
test('all 226 official conference sessions are represented', () => {
  assert.equal(data.catalog.filter(x => x.officialSessionId && x.available !== false).length, 226);
  assert.equal(data.catalog.filter(x => x.sessionType === 'Roundtable' && x.available !== false).length, 50);
});
test('hospitality, MCP and certification sessions are discoverable', () => {
  const h = harness();
  for (const title of ['Industry Deep Dive | Customer Loyalty in Travel, Hospitality, and Transportation', 'Expanding Agents with Connectors and MCPs', 'Certification Prep Session: Extend Microsoft Power Platform Solutions with Code and AI']) {
    assert.ok(['2026-10-27', '2026-10-28', '2026-10-29'].some(d => h.app.catalogForDay(d).some(x => x.title === title)), title);
  }
});
test('every available overlapping session can be offered as a swap', () => {
  const { app } = harness();
  for (const base of data.sessions.filter(x => x.kind !== 'hold')) {
    const offered = new Set(app.optionsFor(base).map(x => norm(x.title)));
    for (const candidate of app.catalogForDay(base.day)) {
      if (candidate.start < base.end && base.start < candidate.end && norm(candidate.title) !== norm(base.title)) {
        assert.ok(offered.has(norm(candidate.title)), base.title + ' -> ' + candidate.title);
      }
    }
  }
});
const day = '2026-10-27';
const base = { id: 'base', title: 'Original seminar', day, start: '10:00', end: '11:00', who: 'David', room: 'A' };
const shifted = { id: 'shifted', title: 'Staggered seminar', day, start: '10:45', end: '11:45', room: 'B' };
const late = { id: 'late', title: 'Later overlapping seminar', day, start: '11:00', end: '12:00', room: 'C' };
const retired = { id: 'retired', title: 'No longer in current agenda', day, start: '10:45', end: '11:45', room: 'D', available: false };
const synthetic = { sessions: [base], alternatives: [], catalog: [shifted, late, retired], catalogSourceUrl: 'https://example.com' };
const choice = value => [{ id: '0123456789abcdef01234567', ts: '2026-10-27T00:00:00.000Z', type: 'choice', payload: { key: 'base::David', value } }];
test('swap choices use the selected seminar window after a staggered swap', () => {
  const h = harness(synthetic, choice('shifted'));
  h.app.swapModal('base', 'David');
  assert.ok(h.html('#dialog-root').includes('data-alt="late"'));
  assert.ok(!h.html('#dialog-root').includes('data-alt="retired"'));
});
test('a second staggered swap remains selected after refresh', () => {
  const { app } = harness(synthetic, choice('late'));
  assert.equal(app.activeItem(base, app.snapshot()).id, 'late');
});
test('time filtering includes overlapping staggered sessions', () => {
  const h = harness(synthetic);
  h.app.setFind(day, '11:00');
  h.app.findResults(h.app.snapshot());
  assert.ok(h.html('#find-results').includes('Staggered seminar'));
});
test('previous saved catalog IDs remain resolvable', () => {
  for (const id of ['official-032', 'official-064', 'official-103', 'official-122']) assert.ok(data.catalog.some(x => x.id === id), id);
  assert.equal(new Set(data.catalog.map(x => x.id)).size, data.catalog.length);
});
test('retired seminars and personal meeting holds are excluded from available seminars', () => {
  const { app } = harness();
  for (const d of ['2026-10-27', '2026-10-28', '2026-10-29']) for (const x of app.catalogForDay(d)) {
    assert.notEqual(x.available, false, x.title);
    assert.notEqual(x.kind, 'hold', x.title);
  }
});
test('add, replace and remove persist independently for David and Peter', () => {
  let h = harness({ ...synthetic, sessions: [{ ...base, who: 'Both' }] });
  h.app.addToSchedule('shifted', 'David');
  h = h.reload();
  assert.equal(h.app.selectedEntries('David', h.app.snapshot())[0].__current.id, 'shifted');
  assert.equal(h.app.selectedEntries('Peter', h.app.snapshot())[0].__current.id, 'base');
  h.app.addToSchedule('late', 'David');
  h = h.reload();
  assert.equal(h.app.selectedEntries('David', h.app.snapshot())[0].__current.id, 'late');
  h.app.removeFromSchedule('base', 'David');
  h.app.addToSchedule('late', 'Peter');
  h = h.reload();
  assert.equal(h.app.selectedEntries('David', h.app.snapshot()).length, 0);
  assert.equal(h.app.selectedEntries('Peter', h.app.snapshot()).length, 2);
  h.app.removeFromSchedule('late', 'Peter');
  h = h.reload();
  assert.equal(h.app.selectedEntries('Peter', h.app.snapshot()).length, 1);
});
if (failed) process.exitCode = 1;
