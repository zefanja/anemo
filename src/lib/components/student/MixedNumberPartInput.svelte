<script lang="ts">
	/**
	 * Mixed-number display with one part as an input and the rest pre-filled.
	 *
	 * missingPart='whole'     → [INPUT]  n/d   (whole is unknown, fraction shown)
	 * missingPart='numerator' → whole [INPUT]/d  (numerator is unknown, rest shown)
	 *
	 * When emitFullFraction=true and missingPart='numerator', the value binding
	 * emits "inputValue/d" so the server can check it as a fraction.
	 * Otherwise it emits just the typed number string.
	 */

	let {
		missingPart,
		whole = undefined,
		numerator = undefined,
		denominator,
		emitFullFraction = false,
		value = $bindable(''),
		disabled = false,
		onsubmit
	}: {
		missingPart: 'whole' | 'numerator';
		whole?: number;
		numerator?: number;
		denominator: number;
		emitFullFraction?: boolean;
		value: string;
		disabled?: boolean;
		onsubmit?: () => void;
	} = $props();

	let rawInput = $state('');
	let inputEl = $state<HTMLInputElement | null>(null);

	// Internal → external
	$effect(() => {
		if (missingPart === 'numerator' && emitFullFraction) {
			value = rawInput !== '' ? `${rawInput}/${denominator}` : '';
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

<div class="mixed-wrap" aria-label="Gemischte Zahl Eingabe">
	<!-- Whole part -->
	{#if missingPart === 'whole'}
		<input
			bind:this={inputEl}
			bind:value={rawInput}
			type="number"
			inputmode="numeric"
			class="whole-input"
			placeholder="?"
			{disabled}
			onkeydown={handleKey}
			aria-label="Ganzer Anteil"
		/>
	{:else}
		<div class="whole-known">{whole}</div>
	{/if}

	<!-- Fraction part (numerator either input or known; denominator always known) -->
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
			<div class="frac-known num">{numerator}</div>
		{/if}

		<div class="frac-line" aria-hidden="true"></div>
		<div class="frac-known den">{denominator}</div>
	</div>
</div>

<style>
	.mixed-wrap {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	/* Whole number */
	.whole-input {
		width: 56px;
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
	.whole-input::-webkit-outer-spin-button,
	.whole-input::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}
	.whole-input:focus {
		border-color: var(--c-primary);
		box-shadow: 0 0 0 3px var(--c-primary-light);
	}
	.whole-input:disabled {
		background: var(--c-gray-100);
		color: var(--c-gray-400);
	}
	.whole-known {
		min-width: 56px;
		padding: 0.5rem 0.5rem;
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

	/* Fraction part */
	.fraction {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
	}
	.frac-input {
		width: 64px;
		padding: 0.4rem 0.25rem;
		text-align: center;
		font-size: 1.1rem;
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
	.frac-input:disabled {
		background: var(--c-gray-100);
		color: var(--c-gray-400);
	}
	.frac-known {
		width: 64px;
		padding: 0.4rem 0.25rem;
		text-align: center;
		font-size: 1.1rem;
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
		width: 64px;
		height: 3px;
		background: var(--c-gray-700);
		border-radius: 2px;
	}
</style>
