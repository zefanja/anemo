<script lang="ts">
	let {
		a,
		b,
		op,
		submittedAnswer,
		correctAnswer
	}: {
		a: number;
		b: number;
		op: '+' | '-' | '×' | ':';
		submittedAnswer: string;
		correctAnswer: string;
	} = $props();

	// ── Division step computation (same as WrittenCalcInput) ─────────────────

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

	// ── Simple column layout (+, -) ──────────────────────────────────────────

	const aStr = $derived(String(a));
	const bStr = $derived(String(b));
	const resultLen = $derived(correctAnswer.length);
	const innerCols = $derived(Math.max(aStr.length, bStr.length, resultLen));
	const aDigits = $derived<(string | null)[]>([
		...Array(innerCols - aStr.length).fill(null),
		...aStr.split('')
	]);
	const bDigits = $derived<(string | null)[]>([
		...Array(innerCols - bStr.length).fill(null),
		...bStr.split('')
	]);
	const opSymbol = $derived(op === '+' ? '+' : '−');
	const answerOffset = $derived(innerCols - resultLen);
	const paddedSubmitted = $derived(submittedAnswer.padStart(correctAnswer.length, '?'));
	const digits = $derived(
		correctAnswer.split('').map((correct, i) => ({
			submitted: paddedSubmitted[i] ?? '?',
			correct,
			wrong: paddedSubmitted[i] !== correct
		}))
	);
	const hasAnyWrong = $derived(digits.some(d => d.wrong));

	// ── Multiplication (×) ───────────────────────────────────────────────────

	const bRowDigits = $derived(op === '×' ? String(b).split('').map(Number) : []);
	const mmNumRows = $derived(bRowDigits.length);
	const mmSingle = $derived(mmNumRows === 1);
	const mmShifts = $derived(bRowDigits.map((_, i) => mmNumRows - 1 - i));
	const mmPartialVals = $derived(bRowDigits.map(d => a * d));
	const mmPartialStrs = $derived(mmPartialVals.map(v => String(v)));
	const mmR = $derived(a * b);
	const mmRStr = $derived(String(mmR));
	const mmTotalCols = $derived(
		mmSingle
			? (mmPartialStrs[0]?.length ?? 1)
			: Math.max(mmRStr.length, ...mmPartialStrs.map((s, i) => s.length + mmShifts[i]))
	);
	const mmPartialLeftPads = $derived(
		bRowDigits.map((_, i) => mmTotalCols - mmPartialStrs[i].length - mmShifts[i])
	);
	const mmRLeftPad = $derived(mmTotalCols - mmRStr.length);

	// Eingabe des Schülers vs. korrektes Ergebnis
	const mmResultStr = $derived(mmSingle ? (mmPartialStrs[0] ?? '') : mmRStr);
	const mmPaddedSubmitted = $derived(submittedAnswer.padStart(mmResultStr.length, '?'));
	const mmDigits = $derived(
		mmResultStr.split('').map((correct, i) => ({
			submitted: mmPaddedSubmitted[i] ?? '?',
			correct,
			wrong: mmPaddedSubmitted[i] !== correct
		}))
	);
	const mmHasAnyWrong = $derived(mmDigits.some(d => d.wrong));

	// ── Division (:) ─────────────────────────────────────────────────────────

	const divSteps = $derived(op === ':' ? computeDivSteps(a, b) : []);
	const divStr   = $derived(String(a));
	const divLen   = $derived(divStr.length);

	const wdPaddedSubmitted = $derived(submittedAnswer.padStart(divSteps.length, '?'));
	const wdDigits = $derived(
		divSteps.map((step, i) => ({
			submitted: wdPaddedSubmitted[i] ?? '?',
			correct: String(step.quot_digit),
			wrong: wdPaddedSubmitted[i] !== String(step.quot_digit)
		}))
	);
	const wdHasAnyWrong = $derived(wdDigits.some(d => d.wrong));
</script>

<div class="feedback-wrap">

	{#if op === '+' || op === '-'}
		<!-- ── Schriftliche Addition / Subtraktion ── -->
		<div class="col-wrap">
			<div class="col-row">
				<span class="op-cell"></span>
				{#each aDigits as d}<span class="digit-cell">{d ?? ''}</span>{/each}
			</div>
			<div class="col-row">
				<span class="op-cell op-symbol">{opSymbol}</span>
				{#each bDigits as d}<span class="digit-cell">{d ?? ''}</span>{/each}
			</div>
			<div class="col-divider" style="width: calc({1 + innerCols} * var(--cell-size))"></div>

			<!-- Eingabe des Schülers -->
			<div class="col-row">
				<span class="op-cell answer-label wrong-label">✗</span>
				{#each Array(answerOffset) as _}<span class="digit-cell"></span>{/each}
				{#each digits as d}
					<span class="answer-cell" class:cell-wrong={d.wrong} class:cell-correct={!d.wrong}>
						{d.submitted}
					</span>
				{/each}
			</div>

			{#if hasAnyWrong}
				<div class="col-row">
					<span class="op-cell answer-label correct-label">✓</span>
					{#each Array(answerOffset) as _}<span class="digit-cell"></span>{/each}
					{#each digits as d}
						<span class="answer-cell cell-solution" class:cell-solution-highlight={d.wrong}>
							{d.correct}
						</span>
					{/each}
				</div>
			{/if}
		</div>

	{:else if op === '×'}
		<!-- ── Schriftliche Multiplikation (Zwischenprodukte) ── -->
		<div class="mm-wrap">
			<div class="mm-problem">{a} · {b}</div>
			<div class="col-divider" style="width: calc({1 + mmTotalCols} * var(--cell-size))"></div>

			{#if !mmSingle}
				{#each bRowDigits as _digit, rowIdx}
					{@const shift = mmShifts[rowIdx]}
					{@const leftPad = mmPartialLeftPads[rowIdx]}
					{@const hasPlusSign = shift === 0}
					{@const partialStr = mmPartialStrs[rowIdx]}
					<div class="col-row">
						<span class="op-cell" class:op-symbol={hasPlusSign}>{hasPlusSign ? '+' : ''}</span>
						{#each Array(leftPad) as _}<span class="digit-cell"></span>{/each}
						{#each partialStr.split('') as d}<span class="digit-cell solution-digit">{d}</span>{/each}
						{#each Array(shift) as _}<span class="digit-cell"></span>{/each}
					</div>
				{/each}
				<div class="col-divider" style="width: calc({1 + mmTotalCols} * var(--cell-size))"></div>
			{/if}

			<!-- Ergebnis: Eingabe des Schülers -->
			<div class="col-row">
				<span class="op-cell answer-label wrong-label">✗</span>
				{#each Array(mmRLeftPad) as _}<span class="digit-cell"></span>{/each}
				{#each mmDigits as d}
					<span class="answer-cell" class:cell-wrong={d.wrong} class:cell-correct={!d.wrong}>
						{d.submitted}
					</span>
				{/each}
			</div>

			{#if mmHasAnyWrong}
				<div class="col-row">
					<span class="op-cell answer-label correct-label">✓</span>
					{#each Array(mmRLeftPad) as _}<span class="digit-cell"></span>{/each}
					{#each mmDigits as d}
						<span class="answer-cell cell-solution" class:cell-solution-highlight={d.wrong}>
							{d.correct}
						</span>
					{/each}
				</div>
			{/if}
		</div>

	{:else}
		<!-- ── Schriftliche Division (Schritt für Schritt, korrekte Lösung) ── -->
		<div class="wd-wrap">

			<!-- Problemzeile mit Quotient-Vergleich -->
			<div class="wd-top">
				<div class="wd-digit-area">
					{#each divStr.split('') as ch}<span class="digit-cell">{ch}</span>{/each}
				</div>
				<span class="wd-sym">:</span>
				<span class="digit-cell">{b}</span>
				<span class="wd-sym">=</span>
				{#each wdDigits as d}
					<span class="answer-cell" class:cell-wrong={d.wrong} class:cell-correct={!d.wrong}>
						{d.submitted}
					</span>
				{/each}
			</div>

			{#if wdHasAnyWrong}
				<!-- Korrekte Quotient-Zeile -->
				<div class="wd-top wd-correct-row">
					{#each Array(divLen) as _}<span class="digit-cell"></span>{/each}
					<span class="wd-sym ghost">:</span>
					<span class="digit-cell ghost"></span>
					<span class="wd-sym ghost">=</span>
					{#each wdDigits as d}
						<span class="answer-cell cell-solution" class:cell-solution-highlight={d.wrong}>
							{d.correct}
						</span>
					{/each}
				</div>
			{/if}

			<!-- Rechenweg (korrekte Werte) -->
			<div class="wd-work">
				{#each divSteps as step, k}
					{@const prodStr     = String(step.product)}
					{@const prodLeftCol = step.right_col - prodStr.length + 1}
					{@const pdLeftCol   = step.right_col - step.pd_display.length + 1}
					{@const sepLeftCol  = Math.min(prodLeftCol, pdLeftCol)}

					{#if k > 0}
						<div class="wd-row">
							{#each Array(divLen) as _, col}
								{#if col >= pdLeftCol && col <= step.right_col}
									<span class="digit-cell solution-digit">{step.pd_display[col - pdLeftCol]}</span>
								{:else}
									<span class="digit-cell"></span>
								{/if}
							{/each}
						</div>
					{/if}

					<div class="wd-row">
						{#each Array(divLen) as _, col}
							{@const ci = col - prodLeftCol}
							{#if col >= prodLeftCol && col <= step.right_col}
								<span class="digit-cell solution-digit">{prodStr[ci]}</span>
							{:else}
								<span class="digit-cell"></span>
							{/if}
						{/each}
					</div>

					<div class="wd-sep-row">
						{#each Array(divLen) as _, col}
							<span class="wd-sep-col" class:wd-sep-active={col >= sepLeftCol && col <= step.right_col}></span>
						{/each}
					</div>
				{/each}

				{#if divSteps.length > 0}
					{@const last = divSteps[divSteps.length - 1]}
					{@const remStr = String(last.remainder)}
					{@const remLeftCol = last.right_col - remStr.length + 1}
					<div class="wd-row">
						{#each Array(divLen) as _, col}
							{#if col >= remLeftCol && col <= last.right_col}
								<span class="digit-cell solution-digit">{remStr[col - remLeftCol]}</span>
							{:else}
								<span class="digit-cell"></span>
							{/if}
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.feedback-wrap {
		--cell-size: min(2.75rem, calc((100vw - 5.5rem) / 10));
		display: flex;
		justify-content: center;
		width: 100%;
	}

	/* ── Shared grid ── */
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

	.answer-label {
		font-size: calc(var(--cell-size) * 0.37);
		font-weight: 700;
	}

	.wrong-label { color: var(--c-error); }
	.correct-label { color: var(--c-success); }

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

	.solution-digit {
		color: var(--c-gray-500);
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
		border: 2px solid transparent;
		border-radius: 0.4rem;
	}

	.cell-wrong {
		color: var(--c-error);
		background: color-mix(in srgb, var(--c-error) 10%, transparent);
		border-color: color-mix(in srgb, var(--c-error) 30%, transparent);
	}

	.cell-correct {
		color: var(--c-success);
		background: color-mix(in srgb, var(--c-success) 8%, transparent);
		border-color: color-mix(in srgb, var(--c-success) 25%, transparent);
	}

	.cell-solution {
		color: var(--c-gray-400);
		background: transparent;
		border-color: transparent;
	}

	.cell-solution-highlight {
		color: var(--c-success);
		background: color-mix(in srgb, var(--c-success) 10%, transparent);
		border-color: color-mix(in srgb, var(--c-success) 30%, transparent);
		font-weight: 800;
	}

	/* ── Multiplikation ── */
	.mm-wrap {
		display: inline-flex;
		flex-direction: column;
		align-items: stretch;
		font-family: ui-monospace, 'Courier New', monospace;
		font-size: calc(var(--cell-size) * 0.51);
		font-weight: 700;
	}

	.mm-problem {
		text-align: right;
		padding-left: var(--cell-size);
		padding-bottom: 0.1rem;
		font-size: calc(var(--cell-size) * 0.51);
		font-weight: 700;
		font-family: ui-monospace, 'Courier New', monospace;
		color: var(--c-gray-900);
	}

	/* ── Division ── */
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

	.wd-correct-row {
		margin-top: 0.25rem;
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

	.ghost {
		color: transparent;
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
</style>
