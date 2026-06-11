import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

export async function hashPassword(password: string): Promise<string> {
	return argon2.hash(password);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
	try {
		return await argon2.verify(hash, password);
	} catch {
		return false;
	}
}

export function generateResetToken(): string {
	return randomBytes(32).toString('hex');
}
