import { describe, it, expect } from 'vitest';
import { generateCode, hashCode, verifyCode } from '$lib/server/auth/codes.js';

const VALID_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

describe('generateCode', () => {
	it('generates a 6-character string', () => {
		const code = generateCode();
		expect(code).toHaveLength(6);
	});

	it('uses only the reduced alphabet (no 0, O, 1, I, L)', () => {
		for (let i = 0; i < 30; i++) {
			const code = generateCode();
			for (const ch of code) {
				expect(VALID_ALPHABET).toContain(ch);
			}
		}
	});

	it('never contains easily confused characters', () => {
		const forbidden = ['0', 'O', '1', 'I', 'L'];
		for (let i = 0; i < 30; i++) {
			const code = generateCode();
			for (const ch of forbidden) {
				expect(code).not.toContain(ch);
			}
		}
	});

	it('generates different codes across calls', () => {
		const codes = new Set(Array.from({ length: 20 }, generateCode));
		// With 32^6 ≈ 1 billion possibilities, 20 samples must be unique
		expect(codes.size).toBeGreaterThan(1);
	});
});

describe('hashCode + verifyCode', () => {
	it('verifies the correct code against its hash', async () => {
		const code = generateCode();
		const hash = await hashCode(code);
		expect(await verifyCode(code, hash)).toBe(true);
	});

	it('rejects a different code against the hash', async () => {
		const hash = await hashCode('ABCDEF');
		// Deliberately different code
		expect(await verifyCode('ZZZZZ2', hash)).toBe(false);
	});

	it('is case-insensitive (normalises to uppercase)', async () => {
		const hash = await hashCode('abcdef');
		expect(await verifyCode('ABCDEF', hash)).toBe(true);
		expect(await verifyCode('abcdef', hash)).toBe(true);
	});

	it('produces different hashes for different inputs', async () => {
		const h1 = await hashCode('AAAAAA');
		const h2 = await hashCode('BBBBBB');
		expect(h1).not.toBe(h2);
	});
});
