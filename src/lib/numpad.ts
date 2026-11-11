// On-screen number pad: routes key presses into whatever answer input is active.
//
// Each press is first dispatched as a synthetic `keydown`, so components that
// implement their own key handling (fraction fields jumping to the denominator,
// written calculation listening on window, …) react exactly as to a hardware key.
// If nobody handled it, the edit is applied to the focused <input> directly and an
// `input` event is fired so Svelte bindings update.

export type PadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | ',' | '-' | 'Backspace' | 'Enter';

const valueSetter = typeof HTMLInputElement !== 'undefined'
	? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
	: undefined;

function setValue(input: HTMLInputElement, value: string) {
	valueSetter?.call(input, value);
	input.dispatchEvent(new Event('input', { bubbles: true }));
}

function selection(input: HTMLInputElement): [number, number] {
	try {
		const s = input.selectionStart;
		const e = input.selectionEnd;
		if (s !== null && e !== null) return [s, e];
	} catch {
		// type="number" has no selection API
	}
	return [input.value.length, input.value.length];
}

function setCaret(input: HTMLInputElement, pos: number) {
	try {
		input.setSelectionRange(pos, pos);
	} catch {
		// ignore for type="number"
	}
}

/** Pure edit helper (unit tested): returns the new value and caret position. */
export function applyKey(value: string, start: number, end: number, key: PadKey, maxLength?: number): { value: string; caret: number } {
	if (key === 'Backspace') {
		if (start !== end) return { value: value.slice(0, start) + value.slice(end), caret: start };
		if (start === 0) return { value, caret: 0 };
		return { value: value.slice(0, start - 1) + value.slice(start), caret: start - 1 };
	}
	if (key === '-') {
		// Toggle the sign, keep the caret on the same digit
		return value.startsWith('-')
			? { value: value.slice(1), caret: Math.max(0, start - 1) }
			: { value: '-' + value, caret: start + 1 };
	}
	if (key === ',' && value.includes(',')) return { value, caret: start };
	if (key === 'Enter') return { value, caret: start };
	const next = value.slice(0, start) + key + value.slice(end);
	if (maxLength && maxLength > 0 && next.length > maxLength) return { value, caret: start };
	return { value: next, caret: start + 1 };
}

function activeInput(container: HTMLElement, last: HTMLInputElement | null): HTMLInputElement | null {
	const el = document.activeElement;
	if (el instanceof HTMLInputElement && container.contains(el) && !el.disabled) return el;
	if (last && container.contains(last) && !last.disabled) return last;
	const first = container.querySelector<HTMLInputElement>('input:not([disabled]):not([type=hidden])');
	return first;
}

export function pressKey(container: HTMLElement, key: PadKey, last: HTMLInputElement | null = null): void {
	const input = activeInput(container, last);
	if (input && document.activeElement !== input) input.focus({ preventScroll: true });
	const target: EventTarget = input ?? document.body;
	const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
	target.dispatchEvent(ev);
	if (ev.defaultPrevented || !input || key === 'Enter') return;
	const [start, end] = selection(input);
	const max = input.maxLength > 0 ? input.maxLength : undefined;
	const res = applyKey(input.value, start, end, key, max);
	if (res.value !== input.value) {
		setValue(input, res.value);
		setCaret(input, res.caret);
	}
}

/** Give inputs inside `node` inputmode="none" (on) or restore their original inputmode (off). */
export function setPadMode(node: HTMLElement, on: boolean) {
	node.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
		if (on) {
			if (!input.hasAttribute('data-pad')) {
				input.setAttribute('data-pad', input.getAttribute('inputmode') ?? '');
				input.setAttribute('inputmode', 'none');
			}
		} else if (input.hasAttribute('data-pad')) {
			const orig = input.getAttribute('data-pad');
			if (orig) input.setAttribute('inputmode', orig);
			else input.removeAttribute('inputmode');
			input.removeAttribute('data-pad');
		}
	});
}

/**
 * Svelte action: while `enabled`, inputs inside the node (also ones added later)
 * get inputmode="none", so touch devices don't open their system keyboard.
 */
export function numpadInputs(node: HTMLElement, enabled: boolean) {
	let on = enabled;
	const apply = () => setPadMode(node, on);
	const observer = new MutationObserver(apply);
	observer.observe(node, { childList: true, subtree: true });
	apply();
	return {
		update(next: boolean) {
			on = next;
			apply();
		},
		destroy() {
			observer.disconnect();
		}
	};
}
