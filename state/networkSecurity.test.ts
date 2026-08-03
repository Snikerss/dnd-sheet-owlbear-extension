import { describe, it, expect } from 'vitest';
import { sanitizeRichTextString } from './initialization';

describe('Network and Import Security Sanitization', () => {
  it('strips dangerous <script> tags from external JSON text strings', () => {
    const malicious = 'Hello <script>alert("hack")</script><b>World</b>';
    const sanitized = sanitizeRichTextString(malicious);
    expect(sanitized).toBe('Hello <b>World</b>');
  });

  it('strips dangerous <iframe> tags from external JSON text strings', () => {
    const malicious = 'Attack <iframe src="http://evil.com"></iframe> notes';
    const sanitized = sanitizeRichTextString(malicious);
    expect(sanitized).toBe('Attack  notes');
  });

  it('strips event handler attributes like onerror, onload, onclick', () => {
    const malicious = '<img src="x" onerror="alert(1)" /> text';
    const sanitized = sanitizeRichTextString(malicious);
    expect(sanitized).not.toContain('onerror');
  });

  it('strips javascript: URI schemes', () => {
    const malicious = '<a href="javascript:alert(1)">Click</a>';
    const sanitized = sanitizeRichTextString(malicious);
    expect(sanitized).not.toContain('javascript:');
  });

  it('preserves valid formatting tags <b>, <i>, <u>, <s>, <mark>, <span style="...">', () => {
    const valid = '<b>Bold</b> <i>Italic</i> <mark style="background:#fef08a">Marker</mark>';
    const sanitized = sanitizeRichTextString(valid);
    expect(sanitized).toBe(valid);
  });
});
