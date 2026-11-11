import { describe, it, expect } from 'vitest';
import { applyKey } from './numpad.js';

describe('applyKey', () => {
	it('inserts digits at the caret', () => {
		expect(applyKey('12', 2, 2, '3')).toEqual({ value: '123', caret: 3 });
		expect(applyKey('13', 1, 1, '2')).toEqual({ value: '123', caret: 2 });
	});
	it('replaces a selection', () => {
		expect(applyKey('1234', 1, 3, '9')).toEqual({ value: '194', caret: 2 });
	});
	it('deletes before the caret', () => {
		expect(applyKey('123', 3, 3, 'Backspace')).toEqual({ value: '12', caret: 2 });
		expect(applyKey('123', 0, 0, 'Backspace')).toEqual({ value: '123', caret: 0 });
		expect(applyKey('1234', 1, 3, 'Backspace')).toEqual({ value: '14', caret: 1 });
	});
	it('toggles the sign', () => {
		expect(applyKey('5', 1, 1, '-')).toEqual({ value: '-5', caret: 2 });
		expect(applyKey('-5', 2, 2, '-')).toEqual({ value: '5', caret: 1 });
	});
	it('allows only one decimal comma', () => {
		expect(applyKey('3', 1, 1, ',')).toEqual({ value: '3,', caret: 2 });
		expect(applyKey('3,1', 3, 3, ',')).toEqual({ value: '3,1', caret: 3 });
	});
	it('respects maxlength', () => {
		expect(applyKey('9', 1, 1, '1', 1)).toEqual({ value: '9', caret: 1 });
	});
	it('ignores Enter', () => {
		expect(applyKey('7', 1, 1, 'Enter')).toEqual({ value: '7', caret: 1 });
	});
});
