// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import {
  OWLBEAR_ORIGIN,
  OWLBEAR_ORIGINS,
  SAME_ORIGIN,
  isTrustedMessageOrigin,
  getOwlbearParentOrigin,
  isOwlbear,
} from './environment';

describe('Environment & Origin Policy', () => {
  const originalReferrer = document.referrer;

  afterEach(() => {
    Object.defineProperty(document, 'referrer', {
      value: originalReferrer,
      configurable: true,
    });
  });

  it('defines canonical OWLBEAR_ORIGIN and trusted origins list', () => {
    expect(OWLBEAR_ORIGIN).toBe('https://www.owlbear.rodeo');
    expect(OWLBEAR_ORIGINS).toContain('https://www.owlbear.rodeo');
    expect(OWLBEAR_ORIGINS).toContain('https://owlbear.rodeo');
  });

  it('SAME_ORIGIN matches window.location.origin in jsdom', () => {
    expect(SAME_ORIGIN).toBe(window.location.origin);
  });

  it('isTrustedMessageOrigin trusts SAME_ORIGIN, empty origin, and OBR origins', () => {
    expect(isTrustedMessageOrigin('')).toBe(true);
    expect(isTrustedMessageOrigin(SAME_ORIGIN)).toBe(true);
    expect(isTrustedMessageOrigin('https://www.owlbear.rodeo')).toBe(true);
    expect(isTrustedMessageOrigin('https://owlbear.rodeo')).toBe(true);
    expect(isTrustedMessageOrigin('https://evil.attacker.com')).toBe(false);
  });

  it('getOwlbearParentOrigin returns canonical origin if document.referrer is empty or untrusted', () => {
    Object.defineProperty(document, 'referrer', {
      value: '',
      configurable: true,
    });
    expect(getOwlbearParentOrigin()).toBe(OWLBEAR_ORIGIN);

    Object.defineProperty(document, 'referrer', {
      value: 'https://evil.com/fake-room',
      configurable: true,
    });
    expect(getOwlbearParentOrigin()).toBe(OWLBEAR_ORIGIN);
  });

  it('getOwlbearParentOrigin extracts trusted origin when document.referrer is from OBR', () => {
    Object.defineProperty(document, 'referrer', {
      value: 'https://owlbear.rodeo/room/test-123',
      configurable: true,
    });
    expect(getOwlbearParentOrigin()).toBe('https://owlbear.rodeo');

    Object.defineProperty(document, 'referrer', {
      value: 'https://www.owlbear.rodeo/room/test-456',
      configurable: true,
    });
    expect(getOwlbearParentOrigin()).toBe('https://www.owlbear.rodeo');
  });

  it('isOwlbear returns false in standalone mode when parent === window', () => {
    expect(window.parent === window).toBe(true);
    expect(isOwlbear()).toBe(false);
  });
});
