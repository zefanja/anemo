<script lang="ts">
	/**
	 * Fraction display with one part pre-filled (known) and the other as an input.
	 * Used for Kürzen, Erweitern, and Gemischte-Zahl ↔ Unechter-Bruch tasks.
	 *
	 * When emitFullFraction=true the value binding emits "n/d" (for fraction-type
	 * correctAnswers). When false it emits just the typed number (for integer types).
	 */

	let {
		missingPart,
		knownNumerator = undefined,
		knownDenominator = undefined,
		emitFullFraction = false,
		value = $bindable(''),
		disabled = false,
		onsubmit
	}: {
		missingPart: 'numerator' | 'denominator';
		knownNumerator?: number;
		knownDenominator?: number;
		emitFullFraction?: boolean;
		value: string;
		disabled?: boolean;
		onsubmit?: () => void;
	} = $props();

	let rawInput = $state('');
	let inputEl = $state<HTMLInputElement | null>(null);

	// Internal → external
	$effect(() => {
		if (emitFullFraction) {
			if (missingPart === 'numerator' && knownDenominator !== undefined) {
				value = rawInput !== '' ? `${rawInput}/${knownDenominator}` : '';
			} else if (missingPart === 'denominator' && knownNumerator !== undefined) {
				value = rawInput !== '' ? `${knownNumerator}/${rawInput}` : '';
			} else {
				value = rawInput;
			}
		} else {
			value = rawInput;
		}
	});

	// External reset → clear internal
	$effect(() => {
		if (value === '') rawInput = '';
	});

	export function focus() {
		inputEl?.focus();
	}

	function handleKey(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			onsubmit?.();
		}
	}
</script>

<div class="fraction-wrap" aria-label="Brucheingabe">
	<div class="fraction">
		{#if missingPart === 'numerator'}
			<input
				bind:this={inputEl}
				bind:value={rawInput}
				type="number"
				inputmode="numeric"
				class="frac-input num"
				placeholder="?"
				{disabled}
				onkeydown={handleKey}
				aria-label="Zähler"
			/>
		{:else}
			<div class="frac-known num">{knownNumerator}</div>
		{/if}

		<div class="frac-line" aria-hidden="true"></div>

		{#if missingPart === 'denominator'}
			<input
				bind:this={inputEl}
				bind:value={rawInput}
				type="number"
				inputmode="numeric"
				class="frac-input den"
				placeholder="?"
				{disabled}
				onkeydown={handleKey}
				aria-label="Nenner"
			/>
		{:else}
			<div class="frac-known den">{knownDenominator}</div>
		{/if}
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

	/* Input field (the unknown part) */
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
	.frac-input.num {
		border-bottom-left-radius: 0;
		border-bottom-right-radius: 0;
		border-bottom: none;
	}
	.frac-input.den {
		border-top-left-radius: 0;
		border-top-right-radius: 0;
		border-top: none;
	}
	.frac-input:disabled {
		background: var(--c-gray-100);
		color: var(--c-gray-400);
	}

	/* Static known part */
	.frac-known {
		width: 72px;
		padding: 0.5rem 0.25rem;
		text-align: center;
		font-size: 1.25rem;
		font-weight: 700;
		background: var(--c-primary-light, #f0fdf4);
		color: var(--c-gray-900);
		border: 2px solid var(--c-primary, #16a34a);
		border-radius: var(--radius);
		box-sizing: border-box;
		line-height: normal;
		user-select: none;
	}
	.frac-known.num {
		border-bottom-left-radius: 0;
		border-bottom-right-radius: 0;
		border-bottom: none;
	}
	.frac-known.den {
		border-top-left-radius: 0;
		border-top-right-radius: 0;
		border-top: none;
	}

	.frac-line {
		width: 72px;
		height: 3px;
		background: var(--c-gray-700);
		border-radius: 2px;
	}
</style>
