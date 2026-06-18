import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

const { getFontAxes } = require('next/dist/compiled/@next/font/dist/google/get-font-axes');
const { getGoogleFontsUrl } = require('next/dist/compiled/@next/font/dist/google/get-google-fonts-url');

const mockPath = path.join(process.cwd(), 'e2e', 'next-font-google-mocks.cjs');

function googleFontUrl(fontFamily: string, weights: string[]) {
  return getGoogleFontsUrl(fontFamily, getFontAxes(fontFamily, weights, ['normal'], undefined), 'swap');
}

describe('next/font Google mocks for e2e', () => {
  it('covers every Google font URL used by the root layout', () => {
    expect(existsSync(mockPath)).toBe(true);

    const mockedResponses = require(mockPath);
    const expectedUrls = [
      googleFontUrl('Manrope', ['400', '500', '600', '700']),
      googleFontUrl('Unbounded', ['600', '700']),
      googleFontUrl('Anybody', ['600', '700', '800']),
    ];

    for (const url of expectedUrls) {
      expect(mockedResponses[url], url).toEqual(expect.any(String));
      expect(mockedResponses[url]).toContain('@font-face');
      expect(mockedResponses[url]).toContain('src: local("Arial")');
      expect(mockedResponses[url]).not.toContain('fonts.gstatic.com');
    }
  });
});
