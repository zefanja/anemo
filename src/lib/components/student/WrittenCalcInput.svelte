<script lang="ts">
	let {
		a,
		b,
		op,
		value = $bindable(''),
		disabled = false,
		onsubmit
	}: {
		a: number;
		b: number;
		op: '+' | '-' | '×' | ':';
		value: string;
		disabled?: boolean;
		onsubmit?: () => void;
	} = $props();

	const aStr = $derived(String(a));
	const bStr = $derived(String(b));

	const resultVal = $derived(
		op === '+' ? a + b :
		op === '-' ? a - b :
		op === '×' ? a * b :
		Math.round(a / b)
	);

	const resultLen = $derived(String(resultVal).length);

	// Column layout: operator col + max(aLen, bLen, resultLen) digit cols
	const innerCols = $derived(Math.max(aStr.length, bStr.length, resultLen));
	const numCols = $derived(1 + innerCols);

	// Right-aligned digit arrays (null = empty/spacer cell)
	const aDigits = $derived<(string | null)[]>([
		...Array(innerCols - aStr.length).fill(null),
		...aStr.split('')
	]);
	const bDigits = $derived<(string | null)[]>([
		...Array(innerCols - bStr.length).fill(null),
		...bStr.split('')
	]);

	const opSymbol = $derived(
		op === '+' ? '+' :
		op === '-' ? '−' :
		op === '×' ? '·' :
		':'
	);

	// Answer cells
	let cells = $state<string[]>(Array(1).fill(''));

	$effect(() => {
		const len = resultLen;
		cells = Array(len).fill('');
	});

	$effect(() => {
		const allFilled = cells.length > 0 && cells.every(c => c !== '');
		value = allFilled ? cells.join('') : '';
	});

	// External reset (e.g. new task loaded)
	$effect(() => {
		if (value === '' && cells.some(c => c !== '')) {
			cells = Array(resultLen).fill('');
		}
	});

	let cellEls = $state<(HTMLInputElement | null)[]>([]);

	function oninput(i: number, e: Event) {
		const input = e.target as HTMLInputElement;
		const digit = input.value.replace(/\D/g, '').slice(-1);
		input.value = digit;
		cells = cells.map((c, j) => j === i ? digit : c);
		if (digit && i < cells.length - 1) {
			cellEls[i + 1]?.focus();
		}
	}

	function onkeydown(i: number, e: KeyboardEvent) {
		if (e.key === 'Backspace') {
			e.preventDefault();
			if (cells[i] !== '') {
				cells = cells.map((c, j) => j === i ? '' : c);
			} else if (i > 0) {
				cells = cells.map((c, j) => j === i - 1 ? '' : c);
				cellEls[i - 1]?.focus();
			}
		} else if (e.key === 'ArrowLeft' && i > 0) {
			e.preventDefault();
			cellEls[i - 1]?.focus();
		} else if (e.key === 'ArrowRight' && i < cells.length - 1) {
			e.preventDefault();
			cellEls[i + 1]?.focus();
		} else if (e.key === 'Enter' && cells.every(c => c !== '')) {
			onsubmit?.();
		}
	}

	// Number of spacer cells to the left of answer cells in the result row
	const answerOffset = $derived(innerCols - resultLen);

	export function focus() {
		cellEls[0]?.focus();
	}
</script>

{#if op === ':'}
	<!-- Division: inline format  a : b = [cells] -->
	<div class="div-wrap" aria-label="Divisionsrechnung">
		<div class="div-row">
			<span class="div-number">{a}</span>
			<span class="div-op">:</span>
			<span class="div-number">{b}</span>
			<span class="div-eq">=</span>
			<div class="div-cells">
				{#each cells as cell, i}
					<input
						bind:this={cellEls[i]}
						type="text"
						inputmode="numeric"
						class="answer-cell"
						class:filled={cell !== ''}
						maxlength="2"
						value={cell}
						{disabled}
						oninput={(e) => oninput(i, e)}
						onkeydown={(e) => onkeydown(i, e)}
						aria-label={`Stelle ${cells.length - i}`}
					/>
				{/each}
			</div>
		</div>
	</div>
{:else}
	<!-- Column layout for +, -, × -->
	<div
		class="col-wrap"
		aria-label="Schriftliche Rechnung"
	>
		<!-- Row 1: number a -->
		<div class="col-row">
			<span class="op-cell"></span>
			{#each aDigits as d}
				<span class="digit-cell">{d ?? ''}</span>
			{/each}
		</div>

		<!-- Row 2: operator + number b -->
		<div class="col-row">
			<span class="op-cell op-symbol">{opSymbol}</span>
			{#each bDigits as d}
				<span class="digit-cell">{d ?? ''}</span>
			{/each}
		</div>

		<!-- Divider line: total width = numCols cells -->
		<div class="col-divider" style="width: calc({numCols} * var(--cell-size))"></div>

		<!-- Row 3: answer cells -->
		<div class="col-row">
			<span class="op-cell"></span>
			{#each Array(answerOffset) as _}
				<span class="digit-cell"></span>
			{/each}
			{#each cells as cell, i}
				<input
					bind:this={cellEls[i]}
					type="text"
					inputmode="numeric"
					class="answer-cell"
					class:filled={cell !== ''}
					maxlength="2"
					value={cell}
					{disabled}
					oninput={(e) => oninput(i, e)}
					onkeydown={(e) => onkeydown(i, e)}
					aria-label={`Stelle ${cells.length - i}`}
				/>
			{/each}
		</div>
	</div>
{/if}

<style>
	/* ── Shared cell sizing ── */
	:root {
		--cell-size: 2.75rem;
	}

	/* ── Column layout (+ - ×) ── */
	.col-wrap {
		display: inline-block;
	}

	.col-row {
		display: flex;
		align-items: center;
	}

	.op-cell {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: var(--cell-size);
		height: var(--cell-size);
		font-size: 1.4rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--c-gray-700);
	}

	.op-symbol {
		color: var(--c-gray-900);
	}

	.digit-cell {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: var(--cell-size);
		height: var(--cell-size);
		font-size: 1.4rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		font-family: ui-monospace, 'Courier New', monospace;
		color: var(--c-gray-900);
	}

	.col-divider {
		height: 3px;
		background: var(--c-gray-700);
		border-radius: 2px;
		margin: 2px 0;
	}

	/* ── Answer input cells (shared) ── */
	.answer-cell {
		width: var(--cell-size);
		height: var(--cell-size);
		flex-shrink: 0;
		text-align: center;
		font-size: 1.4rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		font-family: ui-monospace, 'Courier New', monospace;
		border: 2px solid var(--c-gray-200);
		border-radius: 0.4rem;
		outline: none;
		background: #fff;
		color: var(--c-gray-900);
		padding: 0;
		/* Remove spinner */
		appearance: none;
		-webkit-appearance: textfield;
		-moz-appearance: textfield;
		transition: border-color 0.12s, box-shadow 0.12s;
	}

	.answer-cell::-webkit-outer-spin-button,
	.answer-cell::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	.answer-cell:focus {
		border-color: var(--c-primary);
		box-shadow: 0 0 0 3px var(--c-primary-light);
		z-index: 1;
	}

	.answer-cell.filled {
		border-color: var(--c-gray-400);
		background: var(--c-gray-50);
	}

	.answer-cell:disabled {
		background: var(--c-gray-100);
		color: var(--c-gray-400);
		border-color: var(--c-gray-200);
	}

	/* ── Division layout ── */
	.div-wrap {
		display: inline-flex;
		align-items: center;
	}

	.div-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.div-number {
		font-size: 1.4rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		font-family: ui-monospace, 'Courier New', monospace;
		color: var(--c-gray-900);
	}

	.div-op {
		font-size: 1.4rem;
		font-weight: 700;
		color: var(--c-gray-700);
		padding: 0 0.1rem;
	}

	.div-eq {
		font-size: 1.4rem;
		font-weight: 700;
		color: var(--c-gray-700);
		padding: 0 0.1rem;
	}

	.div-cells {
		display: flex;
		gap: 0.2rem;
	}
</style>
