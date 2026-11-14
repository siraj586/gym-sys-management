import argon2 from 'argon2';

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password); // argon2id with a random salt per password
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

let dummyHash: Promise<string> | undefined;

/**
 * Does the same amount of work as a real check. Used when the email is unknown,
 * so response time does not reveal which emails have an account.
 */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword('not-a-real-password');
  await argon2.verify(await dummyHash, password);
}
