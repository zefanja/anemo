import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';

// Reduced alphabet: no 0/O, 1/I/L confusion
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

export function generateCode(): string {
	const array = new Uint8Array(CODE_LENGTH);
	crypto.getRandomValues(array);
	return Array.from(array)
		.map((b) => ALPHABET[b % ALPHABET.length])
		.join('');
}

function hmac(code: string): string {
	return createHmac('sha256', env.SESSION_SECRET)
		.update(code.toUpperCase().trim())
		.digest('hex');
}

export async function hashCode(code: string): Promise<string> {
	return hmac(code);
}

export async function verifyCode(code: string, storedHash: string): Promise<boolean> {
	try {
		const a = Buffer.from(hmac(code), 'hex');
		const b = Buffer.from(storedHash, 'hex');
		return a.length === b.length && timingSafeEqual(a, b);
	} catch {
		return false;
	}
}
