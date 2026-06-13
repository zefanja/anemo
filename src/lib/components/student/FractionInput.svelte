<script lang="ts">
	let {
		value = $bindable(''),
		disabled = false,
		numDigits,
		onsubmit
	}: {
		value: string;
		disabled?: boolean;
		numDigits?: number;
		onsubmit?: () => void;
	} = $props();

	let num = $state('');
	let den = $state('');
	let numInput = $state<HTMLInputElement | null>(null);
	let denInput = $state<HTMLInputElement | null>(null);

	// Sync internal state → external value
	$effect(() => {
		if (num !== '' && num != null && den !== '' && den != null) {
			value = `${num}/${den}`;
		} else if (num !== '' && num != null) {
			value = String(num);
		} else {
			value = '';
		}
	});

	// Sync external value → internal (only on initial mount or external reset)
	$effect(() => {
		const v = value == null ? '' : String(value);
		if (v === '') {
			num = '';
			den = '';
		} else if (v.includes('/')) {
			const [n, d] = v.split('/');
			if (String(n) !== String(num ?? '')) num = n ?? '';
			if (String(d) !== String(den ?? '')) den = d ?? '';
		}
	});

	function handleNumInput() {
		if (numDigits && String(num).replace(/\D/g, '').length >= numDigits) {
			denInput?.focus();
		}
	}

	function handleNumKey(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === '/') {
			e.preventDefault();
			denInput?.focus();
		}
	}

	function handleDenKey(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			onsubmit?.();
		}
		if (e.key === 'Backspace' && den === '') {
			e.preventDefault();
			numInput?.focus();
		}
	}

	export function focus() {
		numInput?.focus();
	}
</script>

<div class="fraction-wrap" aria-label="Brucheingabe">
	<div class="fraction">
		<input
			bind:this={numInput}
			bind:value={num}
			type="number"
			inputmode="numeric"
			class="frac-input num"
			placeholder="Zähler"
			{disabled}
			oninput={handleNumInput}
			onkeydown={handleNumKey}
			aria-label="Zähler"
		/>
		<div class="frac-line" aria-hidden="true"></div>
		<input
			bind:this={denInput}
			bind:value={den}
			type="number"
			inputmode="numeric"
			class="frac-input den"
			placeholder="Nenner"
			{disabled}
			onkeydown={handleDenKey}
			aria-label="Nenner"
		/>
	</div>
</div>

<style>
	.fraction-wrap {
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.fraction {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
	}
	.frac-input {
		width: 72px;
		padding: 0.5rem 0.25rem;
		text-align: center;
		font-size: 1.25rem;
		font-weight: 600;
		border: 2px solid var(--c-gray-200);
		border-radius: var(--radius);
		outline: none;
		background: #fff;
		/* Remove spinner arrows */
		appearance: none;
		-webkit-appearance: textfield;
		-moz-appearance: textfield;
	}
	.frac-input::-webkit-outer-spin-button,
	.frac-input::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}
	.frac-input:focus {
		border-color: var(--c-primary);
		box-shadow: 0 0 0 3px var(--c-primary-light);
	}
	.frac-input.num { border-bottom-left-radius: 0; border-bottom-right-radius: 0; border-bottom: none; }
	.frac-input.den { border-top-left-radius: 0; border-top-right-radius: 0; border-top: none; }
	.frac-line {
		width: 72px;
		height: 3px;
		background: var(--c-gray-700);
		border-radius: 2px;
	}
	.frac-input:disabled {
		background: var(--c-gray-100);
		color: var(--c-gray-400);
	}
</style>
