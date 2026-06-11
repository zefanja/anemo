import argon2 from 'argon2';

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

export async function hashCode(code: string): Promise<string> {
	return argon2.hash(code.toUpperCase().trim());
}

export async function verifyCode(code: string, hash: string): Promise<boolean> {
	try {
		return await argon2.verify(hash, code.toUpperCase().trim());
	} catch {
		return false;
	}
}
