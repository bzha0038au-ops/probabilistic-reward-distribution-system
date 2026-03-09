import { describe, expect, it } from 'vitest';

import { cn } from './utils';

describe('cn', () => {
  it('merges tailwind classes with last-write-wins semantics', () => {
    expect(cn('px-2', 'text-sm', 'px-4')).toBe('text-sm px-4');
  });

  it('ignores falsy values while preserving valid class names', () => {
    expect(cn('font-semibold', null, undefined, false && 'hidden')).toBe(
      'font-semibold'
    );
  });
});
