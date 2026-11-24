/**
 * i18n key parity — every key in the English block has a matching key in
 * the Kiswahili block and vice versa.  Catches a missing translation
 * before a user on the other language sees a raw key.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const I18N_PATH = resolve(__dirname, '../index.ts');
const src = readFileSync(I18N_PATH, 'utf8');

// The resources object has `en: { translation: { ... } }` and
// `sw: { translation: { ... } }`.  Extract each block's quoted keys.
function extractKeys(block: string): Set<string> {
  const keys = new Set<string>();
  // Match lines like:  'some.key': 'value',  (6-space indent inside translation)
  const re = /^\s+'([^']+)'\s*:/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    keys.add(m[1]);
  }
  return keys;
}

const enStart = src.indexOf('en: {');
const swStart = src.indexOf('sw: {');
const enBlock = src.slice(enStart, swStart);
const swBlock = src.slice(swStart);

const enKeys = extractKeys(enBlock);
const swKeys = extractKeys(swBlock);

describe('i18n en/sw key parity', () => {
  it('every English key has a Kiswahili translation', () => {
    const missingInSw = [...enKeys].filter((k) => !swKeys.has(k));
    expect(missingInSw, `missing in sw: ${missingInSw.join(', ')}`).toEqual([]);
  });

  it('every Kiswahili key has an English source (no orphan translations)', () => {
    const missingInEn = [...swKeys].filter((k) => !enKeys.has(k));
    expect(missingInEn, `missing in en: ${missingInEn.join(', ')}`).toEqual([]);
  });

  it('no duplicate keys within the English block', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const k of [...enKeys]) {
      // extractKeys uses a Set so duplicates are already collapsed; re-scan
      // the raw block to detect actual duplicate declarations.
    }
    const re = /^\s+'([^']+)'\s*:/gm;
    let m: RegExpExecArray | null;
    const all: string[] = [];
    while ((m = re.exec(enBlock)) !== null) all.push(m[1]);
    for (const k of all) {
      if (seen.has(k)) dupes.push(k);
      seen.add(k);
    }
    expect(dupes, `duplicate en keys: ${[...new Set(dupes)].join(', ')}`).toEqual([]);
  });

  it('the new Part A/B keys exist in both languages', () => {
    const required = [
      'rail.notifications.label',
      'rail.notifications.allClear',
      'rail.help.title',
      'rail.globe.switchToSw',
      'rail.fullscreen.unavailable',
      'common.close',
      'de.rows.title',
      'de.rows.suspectChip',
      'de.prices.title',
      'de.sizeBand.under0_25',
      'de.rel.title',
      'de.rel.rho',
      'de.loc.title',
      'de.loc.metricShareSuspect',
    ];
    for (const k of required) {
      expect(enKeys.has(k), `en missing ${k}`).toBe(true);
      expect(swKeys.has(k), `sw missing ${k}`).toBe(true);
    }
  });

  it('the old de.tabSoon.* strings are gone from both languages', () => {
    for (const k of ['de.tabSoonTitle', 'de.tabSoonQualityNote', 'de.tabSoon.prices', 'de.tabSoon.locations', 'de.tabSoon.relationships', 'de.tabSoon.table']) {
      expect(enKeys.has(k), `en still has ${k}`).toBe(false);
      expect(swKeys.has(k), `sw still has ${k}`).toBe(false);
    }
  });
});
