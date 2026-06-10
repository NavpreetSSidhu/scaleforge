import { describe, expect, it } from 'vitest';
import { initialsFor } from './ProfileMenu';

describe('initialsFor', () => {
  it('uses two initials from a full name', () => {
    expect(initialsFor({ name: 'Ada Lovelace' })).toBe('AL');
  });

  it('falls back to two letters of a single name', () => {
    expect(initialsFor({ name: 'Cher' })).toBe('CH');
  });

  it('derives initials from the email when no name', () => {
    expect(initialsFor({ email: 'grace.hopper@navy.mil' })).toBe('GH');
  });

  it('returns G for a guest (null user)', () => {
    expect(initialsFor(null)).toBe('G');
  });
});
