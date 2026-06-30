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

	// ── Division step computation ─────────────────────────────────────────────

	type DivStep = {
		pd: number;
		pd_display: string;
		right_col: number;
		quot_digit: number;
		product: number;
		remainder: number;
	};

	function computeDivSteps(dividend: number, divisor: number): DivStep[] {
		const divStr = String(dividend);
		const steps: DivStep[] = [];
		let remainder = 0;
		let colIdx = 0;
		while (colIdx < divStr.length) {
			let pd = remainder * 10 + parseInt(divStr[colIdx]);
			let rightCol = colIdx;
			colIdx++;
			// Only merge digits before the first quotient step (leading digits < divisor).
			// After that, each position gets its own step, even if the quotient digit is 0.
			while (steps.length === 0 && pd < divisor && colIdx < divStr.length) {
				pd = pd * 10 + parseInt(divStr[colIdx]);
				rightCol = colIdx;
				colIdx++;
			}
			const quotDigit = Math.floor(pd / divisor);
			const product = quotDigit * divisor;
			remainder = pd - product;
			steps.push({ pd, pd_display: String(pd), right_col: rightCol, quot_digit: quotDigit, product, remainder });
		}
		return steps;
	}

	// ── Simple column layout state (+, -) ────────────────────────────────────

	const aStr = $derived(String(a));
	const bStr = $derived(String(b));
	const opSymbol = $derived(op === '+' ? '+' : '−');

	const simpleResultLen = $derived(
		op === '+' ? String(a + b).length :
		op === '-' ? String(Math.abs(a - b)).length : 0
	);
	const innerCols = $derived(Math.max(aStr.length, bStr.length, simpleResultLen));
	const aDigits = $derived<(string | null)[]>([
		...Array(innerCols - aStr.length).fill(null),
		...aStr.split('')
	]);
	const bDigits = $derived<(string | null)[]>([
		...Array(innerCols - bStr.length).fill(null),
		...bStr.split('')
	]);
	const answerOffset = $derived(innerCols - simpleResultLen);

	let simpleCells = $state<string[]>([]);
	let simpleActive = $state(0);

	// ── Multiplication partial products state (×) ─────────────────────────────

	// bRowDigits: Ziffern von b in Anzeigereihenfolge (höchste zuerst = oberste Zeile)
	const bRowDigits = $derived(op === '×' ? String(b).split('').map(Number) : []);
	const mmNumRows = $derived(bRowDigits.length);
	const mmSingle = $derived(mmNumRows === 1);
	// Verschiebung je Zeile: oberste Zeile = höchster Shift
	const mmShifts = $derived(bRowDigits.map((_, i) => mmNumRows - 1 - i));
	const mmPartialVals = $derived(bRowDigits.map(d => a * d));
	const mmPartialLens = $derived(mmPartialVals.map(v => Math.max(1, String(v).length)));
	const mmR = $derived(a * b);
	const mmRLen = $derived(String(mmR).length);
	const mmTotalCols = $derived(
		mmSingle
			? mmPartialLens[0]
			: Math.max(mmRLen, ...mmPartialLens.map((len, i) => len + mmShifts[i]))
	);
	const mmPartialLeftPads = $derived(
		bRowDigits.map((_, i) => mmTotalCols - mmPartialLens[i] - mmShifts[i])
	);
	const mmRLeftPad = $derived(mmTotalCols - mmRLen);

	let mmCells = $state<string[][]>([]);
	let mmActives = $state<number[]>([]);
	let mmRCells = $state<string[]>([]);
	let mmRActive = $state(0);
	let mmRowIdx = $state(0);
	let mmSection = $state<'partial' | 'result'>('partial');

	// ── Division step-by-step state (:) ──────────────────────────────────────

	const divSteps = $derived(op === ':' ? computeDivSteps(a, b) : []);
	const divStr   = $derived(String(a));
	const divLen   = $derived(divStr.length);

	let wdQuotCells = $state<string[]>([]);
	let wdProdCells = $state<string[][]>([]);
	let wdStep  = $state(0);
	let wdPhase = $state<'quot' | 'prod'>('quot');
	let wdProdPos = $state(0);

	// ── Initialise state when op/a/b changes ─────────────────────────────────

	$effect(() => {
		const _op = op, _a = a, _b = b;
		if (_op === '+' || _op === '-') {
			const rLen = _op === '+' ? String(_a + _b).length : String(Math.abs(_a - _b)).length;
			simpleCells = Array(rLen).fill('');
			simpleActive = rLen - 1;
		} else if (_op === '×') {
			const digits = String(_b).split('').map(Number);
			const single = digits.length === 1;
			const rLen = String(_a * _b).length;
			const cells = digits.map(d => Array(Math.max(1, String(_a * d).length)).fill(''));
			mmCells = cells;
			mmActives = cells.map(row => row.length - 1);
			mmRCells = single ? [] : Array(rLen).fill('');
			mmRActive = rLen - 1;
			mmRowIdx = 0;
			mmSection = 'partial';
		} else if (_op === ':') {
			const steps = computeDivSteps(_a, _b);
			wdQuotCells = Array(steps.length).fill('');
			wdProdCells = steps.map(s => Array(String(s.product).length).fill(''));
			wdStep = 0; wdPhase = 'quot'; wdProdPos = 0;
		}
	});

	// ── allFilled ─────────────────────────────────────────────────────────────

	const allFilled = $derived(
		op === '×'
			? mmSingle
				? (mmCells.length > 0 && mmCells[0].every(c => c !== ''))
				: (mmCells.every(row => row.every(c => c !== '')) && mmRCells.every(c => c !== ''))
			: op === ':'
			? (wdQuotCells.length > 0 && wdQuotCells.every(c => c !== '') &&
			   wdProdCells.every(row => row.every(c => c !== '')))
			: (simpleCells.length > 0 && simpleCells.every(c => c !== ''))
	);

	// ── value binding ─────────────────────────────────────────────────────────

	$effect(() => {
		if (!allFilled) { value = ''; return; }
		if (op === '+' || op === '-') value = simpleCells.join('');
		else if (op === '×') value = mmSingle ? (mmCells[0]?.join('') ?? '') : mmRCells.join('');
		else if (op === ':') value = wdQuotCells.join('');
	});

	// ── Input handlers ────────────────────────────────────────────────────────

	function inputDigit(digit: string) {
		if (disabled) return;
		if (op === '+' || op === '-') {
			simpleCells[simpleActive] = digit; simpleCells = [...simpleCells];
			if (simpleActive > 0) simpleActive--;
		} else if (op === '×') {
			if (mmSection === 'partial') {
				const cells = mmCells[mmRowIdx];
				cells[mmActives[mmRowIdx]] = digit; mmCells = mmCells.map(r => [...r]);
				if (mmActives[mmRowIdx] > 0) {
					mmActives[mmRowIdx]--; mmActives = [...mmActives];
				} else if (mmRowIdx < mmCells.length - 1) {
					mmRowIdx++;
					mmActives[mmRowIdx] = mmCells[mmRowIdx].length - 1;
					mmActives = [...mmActives];
				} else if (!mmSingle) {
					mmSection = 'result'; mmRActive = mmRCells.length - 1;
				}
			} else {
				mmRCells[mmRActive] = digit; mmRCells = [...mmRCells];
				if (mmRActive > 0) mmRActive--;
			}
		} else if (op === ':') {
			if (wdPhase === 'quot') {
				wdQuotCells[wdStep] = digit; wdQuotCells = [...wdQuotCells];
				wdPhase = 'prod'; wdProdPos = 0;
			} else {
				const row = wdProdCells[wdStep];
				row[wdProdPos] = digit; wdProdCells = wdProdCells.map(r => [...r]);
				if (wdProdPos < row.length - 1) {
					wdProdPos++;
				} else if (wdStep < divSteps.length - 1) {
					wdStep++; wdPhase = 'quot'; wdProdPos = 0;
				}
			}
		}
	}

	function doBackspace() {
		if (disabled) return;
		if (op === '+' || op === '-') {
			if (simpleCells[simpleActive] !== '') {
				simpleCells[simpleActive] = ''; simpleCells = [...simpleCells];
			} else if (simpleActive < simpleCells.length - 1) {
				simpleActive++; simpleCells[simpleActive] = ''; simpleCells = [...simpleCells];
			}
		} else if (op === '×') {
			if (mmSection === 'result') {
				if (mmRCells[mmRActive] !== '') { mmRCells[mmRActive] = ''; mmRCells = [...mmRCells]; }
				else if (mmRActive < mmRCells.length - 1) { mmRActive++; mmRCells[mmRActive] = ''; mmRCells = [...mmRCells]; }
				else { mmSection = 'partial'; mmRowIdx = mmCells.length - 1; mmActives[mmRowIdx] = 0; mmActives = [...mmActives]; }
			} else {
				const cells = mmCells[mmRowIdx];
				const active = mmActives[mmRowIdx];
				if (cells[active] !== '') { cells[active] = ''; mmCells = mmCells.map(r => [...r]); }
				else if (active < cells.length - 1) { mmActives[mmRowIdx]++; mmActives = [...mmActives]; mmCells[mmRowIdx][mmActives[mmRowIdx]] = ''; mmCells = mmCells.map(r => [...r]); }
				else if (mmRowIdx > 0) { mmRowIdx--; mmActives[mmRowIdx] = 0; mmActives = [...mmActives]; }
			}
		} else if (op === ':') {
			if (wdPhase === 'prod') {
				const row = wdProdCells[wdStep];
				if (row[wdProdPos] !== '') {
					row[wdProdPos] = ''; wdProdCells = wdProdCells.map(r => [...r]);
				} else if (wdProdPos > 0) {
					wdProdPos--; row[wdProdPos] = ''; wdProdCells = wdProdCells.map(r => [...r]);
				} else {
					wdPhase = 'quot'; wdQuotCells[wdStep] = ''; wdQuotCells = [...wdQuotCells];
				}
			} else {
				if (wdQuotCells[wdStep] !== '') {
					wdQuotCells[wdStep] = ''; wdQuotCells = [...wdQuotCells];
				} else if (wdStep > 0) {
					wdStep--; wdPhase = 'prod';
					wdProdPos = wdProdCells[wdStep].length - 1;
					wdProdCells[wdStep][wdProdPos] = ''; wdProdCells = wdProdCells.map(r => [...r]);
				}
			}
		}
	}

	function onkeydown(e: KeyboardEvent) {
		if (disabled) return;
		if (e.key >= '0' && e.key <= '9') { e.preventDefault(); inputDigit(e.key); }
		else if (e.key === 'Backspace') { e.preventDefault(); doBackspace(); }
		else if (e.key === 'Enter' && allFilled) { onsubmit?.(); }
	}

	export function focus() {}
</script>

<svelte:window {onkeydown} />

<div class="written-wrap">

	{#if op === '+' || op === '-'}
		<!-- ── Schriftliche Addition / Subtraktion ── -->
		<div class="col-wrap" aria-label="Schriftliche Rechnung">
			<div class="col-row">
				<span class="op-cell"></span>
				{#each aDigits as d}
					<span class="digit-cell">{d ?? ''}</span>
				{/each}
			</div>
			<div class="col-row">
				<span class="op-cell op-symbol">{opSymbol}</span>
				{#each bDigits as d}
					<span class="digit-cell">{d ?? ''}</span>
				{/each}
			</div>
			<div class="col-divider" style="width: calc({1 + innerCols} * var(--cell-size))"></div>
			<div class="col-row">
				<span class="op-cell"></span>
				{#each Array(answerOffset) as _}
					<span class="digit-cell"></span>
				{/each}
				{#each simpleCells as cell, i}
					<button
						class="answer-cell"
						class:active={i === simpleActive}
						class:filled={cell !== ''}
						{disabled}
						onclick={() => { simpleActive = i; }}
						aria-label={`Stelle ${simpleCells.length - i}`}
					>{cell}</button>
				{/each}
			</div>
		</div>

	{:else if op === '×'}
		<!-- ── Schriftliche Multiplikation (Zwischenprodukte) ── -->
		<div class="mm-wrap" aria-label="Schriftliche Multiplikation">

			<!-- Aufgabe rechts ausgerichtet -->
			<div class="mm-problem">{a} · {b}</div>
			<div class="col-divider" style="width: calc({1 + mmTotalCols} * var(--cell-size))"></div>

			{#each bRowDigits as _digit, rowIdx}
				{@const shift = mmShifts[rowIdx]}
				{@const leftPad = mmPartialLeftPads[rowIdx]}
				{@const hasPlusSign = !mmSingle && shift === 0}
				{@const cells = mmCells[rowIdx] ?? []}
				{@const activeIdx = mmActives[rowIdx] ?? 0}
				<div class="col-row">
					<span class="op-cell" class:op-symbol={hasPlusSign}>{hasPlusSign ? '+' : ''}</span>
					{#each Array(leftPad) as _}<span class="digit-cell"></span>{/each}
					{#each cells as cell, i}
						<button
							class="answer-cell"
							class:active={mmSection === 'partial' && mmRowIdx === rowIdx && i === activeIdx}
							class:filled={cell !== ''}
							{disabled}
							onclick={() => { mmSection = 'partial'; mmRowIdx = rowIdx; mmActives[rowIdx] = i; mmActives = [...mmActives]; }}
							aria-label={`Teilprodukt Zeile ${rowIdx + 1}, Stelle ${cells.length - i}`}
						>{cell}</button>
					{/each}
					{#each Array(shift) as _}<span class="digit-cell"></span>{/each}
				</div>
			{/each}

			{#if !mmSingle}
				<div class="col-divider" style="width: calc({1 + mmTotalCols} * var(--cell-size))"></div>

				<!-- Ergebnis -->
				<div class="col-row">
					<span class="op-cell"></span>
					{#each Array(mmRLeftPad) as _}<span class="digit-cell"></span>{/each}
					{#each mmRCells as cell, i}
						<button
							class="answer-cell"
							class:active={mmSection === 'result' && i === mmRActive}
							class:filled={cell !== ''}
							{disabled}
							onclick={() => { mmSection = 'result'; mmRActive = i; }}
							aria-label={`Ergebnis, Stelle ${mmRCells.length - i}`}
						>{cell}</button>
					{/each}
				</div>
			{/if}
		</div>

	{:else}
		<!-- ── Schriftliche Division (Schritt für Schritt) ── -->
		<div class="wd-wrap" aria-label="Schriftliche Division">

			<!-- Problemzeile: Dividend : Divisor = Quotientzellen -->
			<div class="wd-top">
				<div class="wd-digit-area">
					{#each divStr.split('') as ch}<span class="digit-cell">{ch}</span>{/each}
				</div>
				<span class="wd-sym">:</span>
				<span class="digit-cell wd-divisor">{b}</span>
				<span class="wd-sym">=</span>
				{#each wdQuotCells as cell, i}
					<button
						class="answer-cell"
						class:active={i === wdStep && wdPhase === 'quot'}
						class:filled={cell !== ''}
						{disabled}
						onclick={() => { wdStep = i; wdPhase = 'quot'; }}
						aria-label={`Quotient, Stelle ${i + 1}`}
					>{cell}</button>
				{/each}
			</div>

			<!-- Rechenweg -->
			<div class="wd-work">
				{#each divSteps as step, k}
					{@const prodStr    = String(step.product)}
					{@const prodLeftCol = step.right_col - prodStr.length + 1}
					{@const pdLeftCol   = step.right_col - step.pd_display.length + 1}
					{@const sepLeftCol  = Math.min(prodLeftCol, pdLeftCol)}

					<!-- Teilender (ab Schritt 1) -->
					{#if k > 0}
						<div class="wd-row">
							{#each Array(divLen) as _, col}
								{#if col >= pdLeftCol && col <= step.right_col}
									<span class="digit-cell">{step.pd_display[col - pdLeftCol]}</span>
								{:else}
									<span class="digit-cell"></span>
								{/if}
							{/each}
						</div>
					{/if}

					<!-- Produkt-Zeile (Eingabezellen) -->
					<div class="wd-row">
						{#each Array(divLen) as _, col}
							{@const ci = col - prodLeftCol}
							{#if col >= prodLeftCol && col <= step.right_col}
								<button
									class="answer-cell"
									class:active={k === wdStep && ci === wdProdPos && wdPhase === 'prod'}
									class:filled={wdProdCells[k]?.[ci] !== ''}
									{disabled}
									onclick={() => { wdStep = k; wdPhase = 'prod'; wdProdPos = ci; }}
									aria-label={`Produkt Schritt ${k + 1}, Stelle ${ci + 1}`}
								>{wdProdCells[k]?.[ci] ?? ''}</button>
							{:else}
								<span class="digit-cell"></span>
							{/if}
						{/each}
					</div>

					<!-- Trennlinie -->
					<div class="wd-sep-row">
						{#each Array(divLen) as _, col}
							<span class="wd-sep-col" class:wd-sep-active={col >= sepLeftCol && col <= step.right_col}></span>
						{/each}
					</div>
				{/each}

				<!-- Rest -->
				{#if divSteps.length > 0}
					{@const last = divSteps[divSteps.length - 1]}
					{@const remStr = String(last.remainder)}
					{@const remLeftCol = last.right_col - remStr.length + 1}
					<div class="wd-row">
						{#each Array(divLen) as _, col}
							{#if col >= remLeftCol && col <= last.right_col}
								<span class="digit-cell">{remStr[col - remLeftCol]}</span>
							{:else}
								<span class="digit-cell"></span>
							{/if}
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Numpad -->
	<div class="numpad">
		{#each [7, 8, 9, 4, 5, 6, 1, 2, 3] as n}
			<button class="np-btn" {disabled} onclick={() => inputDigit(String(n))}>{n}</button>
		{/each}
		<button class="np-btn np-back" {disabled} onclick={doBackspace}>⌫</button>
		<button class="np-btn" {disabled} onclick={() => inputDigit('0')}>0</button>
		<button class="np-btn np-ok" disabled={disabled || !allFilled} onclick={() => onsubmit?.()}>✓</button>
	</div>
</div>

<style>
	.written-wrap {
		--cell-size: min(2.75rem, calc((100vw - 5.5rem) / 10));
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.25rem;
		width: 100%;
	}

	/* ── Shared column grid ── */
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
		font-size: calc(var(--cell-size) * 0.51);
		font-weight: 700;
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
		font-size: calc(var(--cell-size) * 0.51);
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

	/* ── Answer cells ── */
	.answer-cell {
		width: var(--cell-size);
		height: var(--cell-size);
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: calc(var(--cell-size) * 0.51);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		font-family: ui-monospace, 'Courier New', monospace;
		border: 2px solid var(--c-gray-200);
		border-radius: 0.4rem;
		background: #fff;
		color: var(--c-gray-900);
		padding: 0;
		cursor: pointer;
		transition: border-color 0.12s, box-shadow 0.12s;
	}

	.answer-cell.active {
		border-color: var(--c-primary);
		box-shadow: 0 0 0 3px var(--c-primary-light);
	}

	.answer-cell.filled {
		border-color: var(--c-gray-400);
		background: var(--c-gray-50);
	}

	.answer-cell:disabled {
		background: var(--c-gray-100);
		color: var(--c-gray-400);
		border-color: var(--c-gray-200);
		cursor: default;
	}

	/* ── Multiplikation (Zwischenprodukte) ── */
	.mm-wrap {
		display: inline-flex;
		flex-direction: column;
		align-items: stretch;
		font-family: ui-monospace, 'Courier New', monospace;
		font-size: 1.4rem;
		font-weight: 700;
	}

	.mm-problem {
		text-align: right;
		padding-left: var(--cell-size); /* reserviert Platz für Op-Spalte */
		padding-bottom: 0.1rem;
		font-size: calc(var(--cell-size) * 0.51);
		font-weight: 700;
		font-family: ui-monospace, 'Courier New', monospace;
		color: var(--c-gray-900);
	}

	/* ── Schriftliche Division ── */
	.wd-wrap {
		display: inline-flex;
		flex-direction: column;
		align-items: flex-start;
		font-family: ui-monospace, 'Courier New', monospace;
		font-size: calc(var(--cell-size) * 0.51);
		font-weight: 700;
		max-width: 100%;
	}

	.wd-top {
		display: flex;
		align-items: center;
	}

	.wd-digit-area {
		display: flex;
	}

	.wd-sym {
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: calc(var(--cell-size) * 0.51);
		font-weight: 700;
		color: var(--c-gray-700);
		padding: 0 0.2rem;
		flex-shrink: 0;
	}

	.wd-divisor {
		font-weight: 700;
	}

	.wd-work {
		display: flex;
		flex-direction: column;
	}

	.wd-row {
		display: flex;
	}

	.wd-sep-row {
		display: flex;
		height: 5px;
		margin: 0.1rem 0;
	}

	.wd-sep-col {
		width: var(--cell-size);
		height: 5px;
		flex-shrink: 0;
	}

	.wd-sep-active {
		border-top: 3px solid var(--c-gray-700);
	}

	/* ── Numpad ── */
	.numpad {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.5rem;
		width: 100%;
		max-width: 280px;
	}

	.np-btn {
		font-size: 1.5rem;
		font-weight: 700;
		padding: 0.75rem 0;
		border: 2px solid var(--c-gray-200);
		border-radius: 0.6rem;
		background: #fff;
		color: var(--c-gray-900);
		cursor: pointer;
		touch-action: manipulation;
		transition: background 0.1s;
	}

	.np-btn:hover:not(:disabled) {
		background: var(--c-gray-100);
	}

	.np-btn:active:not(:disabled) {
		background: var(--c-gray-200);
	}

	.np-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.np-back {
		color: var(--c-error);
		border-color: #fca5a5;
	}

	.np-back:hover:not(:disabled) {
		background: var(--c-error-light);
	}

	.np-ok {
		border: none;
		background: var(--c-primary);
		color: #fff;
	}

	.np-ok:hover:not(:disabled) {
		background: var(--c-primary-dark);
	}
</style>
