/**
 * Pins the odometer in scripts/version.mjs.
 *
 *   node tests/version.test.mjs       (from the app directory)
 *
 * The rules locked down here are the contract the app side and the release
 * workflow both rely on: one patch step per merge, fixed rollover limits, a
 * dense versionCode, `major.minor` as the OTA runtime, and only x.y.0 building
 * an APK.
 */
import {
  nextVersion,
  parseCommit,
  parseVersion,
  releaseKindFor,
  releaseNotes,
  runtimeVersionFor,
  versionCodeFor,
} from '../scripts/version.mjs';

const failures = [];
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}`);
  if (!ok) failures.push(name);
};
const throws = (fn) => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};

// Odometer steps.
check('a merge bumps the patch', nextVersion('1.0.0') === '1.0.1');
check('patch rolls over at 100', nextVersion('1.0.99') === '1.1.0');
check('minor rolls over at 50', nextVersion('1.49.99') === '2.0.0');
check('--bump minor resets the patch', nextVersion('1.0.37', 'minor') === '1.1.0');
check('--bump minor still rolls over', nextVersion('1.49.5', 'minor') === '2.0.0');
check('--bump major resets everything', nextVersion('1.4.7', 'major') === '2.0.0');
check('an unknown bump is refused', throws(() => nextVersion('1.0.0', 'huge')));

// Parsing.
check('out-of-range minor is refused', throws(() => parseVersion('1.50.0')));
check('out-of-range patch is refused', throws(() => parseVersion('1.0.100')));
check('two-part version is refused', throws(() => parseVersion('1.0')));
check('garbage is refused', throws(() => parseVersion('nonsense')));

// versionCode.
check('1.0.0 -> 5000', versionCodeFor('1.0.0') === 5000);
check('1.0.99 -> 5099', versionCodeFor('1.0.99') === 5099);
check('1.1.0 -> 5100', versionCodeFor('1.1.0') === 5100);
check('2.0.0 -> 10000', versionCodeFor('2.0.0') === 10000);
check(
  'versionCode goes up by exactly one per step across both rollovers',
  ['1.0.98', '1.0.99', '1.1.0', '1.49.99', '2.0.0'].every((v, i, all) =>
    i === 0 || versionCodeFor(v) > versionCodeFor(all[i - 1])) &&
    versionCodeFor(nextVersion('1.0.99')) - versionCodeFor('1.0.99') === 1 &&
    versionCodeFor(nextVersion('1.49.99')) - versionCodeFor('1.49.99') === 1,
);

// Runtime and release kind.
check('runtime of 1.0.6 is "1.0"', runtimeVersionFor('1.0.6') === '1.0');
check('runtime of 2.13.4 is "2.13"', runtimeVersionFor('2.13.4') === '2.13');
check('x.y.0 builds an APK', releaseKindFor('1.1.0') === 'apk');
check('x.y.z (z>0) ships OTA only', releaseKindFor('1.1.1') === 'ota');
check('a patch keeps the runtime', runtimeVersionFor(nextVersion('1.0.5')) === '1.0');
check('a rollover moves the runtime', runtimeVersionFor(nextVersion('1.0.99')) === '1.1');

// Release notes.
const commits = [
  { hash: 'a'.repeat(40), subject: 'feat(scan): faster QR', body: '' },
  { hash: 'b'.repeat(40), subject: 'fix: crash on login', body: '' },
  { hash: 'c'.repeat(40), subject: 'tidy things', body: '' },
  { hash: 'd'.repeat(40), subject: 'refactor!: new store', body: '' },
].map(parseCommit);
const notes = releaseNotes('1.0.1', commits, 'v1.0.0', 'WilfredTinega/Upande-Post-Harvest');
check('notes group features', notes.includes('### Features') && notes.includes('**scan:** faster QR'));
check('notes group fixes', notes.includes('### Bug Fixes'));
check('non-conventional commits land under Other', notes.includes('### Other'));
check('breaking changes are called out', notes.includes('BREAKING CHANGES'));
check(
  'notes link the compare view',
  notes.includes('https://github.com/WilfredTinega/Upande-Post-Harvest/compare/v1.0.0...v1.0.1'),
);

console.log(failures.length ? `\n${failures.length} FAILED` : '\nall passed');
process.exit(failures.length ? 1 : 0);
