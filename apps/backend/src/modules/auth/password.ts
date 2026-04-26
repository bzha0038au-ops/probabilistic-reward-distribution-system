import { compare, genSaltSync, hashSync } from 'bcrypt-ts';

export const hashPassword = (password: string) =>
  hashSync(password, genSaltSync(10));

export const verifyPassword = (password: string, passwordHash: string) =>
  compare(password, passwordHash);
