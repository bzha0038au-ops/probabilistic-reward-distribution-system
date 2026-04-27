import { describe, expect, it } from 'vitest';

import {
  DomainError,
  internalInvariantError,
  shouldCaptureAppError,
  toAppError,
  toPublicError,
} from './errors';

describe('shared errors', () => {
  it('builds non-catastrophic domain errors with a derived code', () => {
    const error = new DomainError('Amount below minimum withdrawal.');

    expect(error.statusCode).toBe(422);
    expect(error.isCatastrophic).toBe(false);
    expect(error.code).toBe('AMOUNT_BELOW_MINIMUM_WITHDRAWAL');
    expect(shouldCaptureAppError(error)).toBe(false);
  });

  it('hides internal messages from public responses', () => {
    const error = toAppError(new Error('database exploded'));
    const publicError = toPublicError(error);

    expect(publicError.statusCode).toBe(500);
    expect(publicError.message).toBe('Internal server error');
    expect(publicError.code).toBeUndefined();
    expect(publicError.details).toBeUndefined();
    expect(shouldCaptureAppError(error)).toBe(true);
  });

  it('preserves status and metadata from error-like objects', () => {
    const error = toAppError({
      message: 'Daily withdrawal limit exceeded.',
      statusCode: 409,
      code: 'DAILY_WITHDRAWAL_LIMIT_EXCEEDED',
      details: ['cap=100.00'],
    });
    const publicError = toPublicError(error);

    expect(publicError.statusCode).toBe(409);
    expect(publicError.message).toBe('Daily withdrawal limit exceeded.');
    expect(publicError.code).toBe('DAILY_WITHDRAWAL_LIMIT_EXCEEDED');
    expect(publicError.details).toEqual(['cap=100.00']);
    expect(shouldCaptureAppError(error)).toBe(false);
  });

  it('marks internal helper errors as catastrophic 5xx errors', () => {
    const error = internalInvariantError('House account not initialized.');
    const publicError = toPublicError(error);

    expect(error.statusCode).toBe(500);
    expect(error.isCatastrophic).toBe(true);
    expect(error.code).toBe('HOUSE_ACCOUNT_NOT_INITIALIZED');
    expect(publicError.message).toBe('Internal server error');
    expect(shouldCaptureAppError(error)).toBe(true);
  });
});
