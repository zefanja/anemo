import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

const ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
	return bcrypt.hash(password, ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
	try {
		return await bcrypt.compare(password, hash);
	} catch {
		return false;
	}
}

export function generateResetToken(): string {
	return randomBytes(32).toString('hex');
}
