<script lang="ts">
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import FractionInput from '$lib/components/student/FractionInput.svelte';
	import FractionPartInput from '$lib/components/student/FractionPartInput.svelte';
	import MixedNumberPartInput from '$lib/components/student/MixedNumberPartInput.svelte';
	import WrittenCalcInput from '$lib/components/student/WrittenCalcInput.svelte';
	import NumberLineInput from '$lib/components/student/NumberLineInput.svelte';
	import MathText from '$lib/components/student/MathText.svelte';
	import type { PlacementState } from '$lib/server/learning/placement.js';

	type Phase = 'loading' | 'question' | 'feedback' | 'complete' | 'error';

	type TaskData = {
		atomId: string;
		atomLabel: string;
		taskId: string;
		prompt: string;
		answerType: 'integer' | 'number' | 'fraction' | 'text' | 'boolean' | 'comparison';
		choices: string[] | null;
		svg: string | null;
		inputData: Record<string, unknown> | null;
		hint: string | null;
	};

	let phase = $state<Phase>('loading');
	let current = $state<TaskData | null>(null);
	let state = $state<PlacementState | null>(null);
	let maxAtoms = $state(15);
	let answer = $state('');
	let lastCorrect = $state<boolean | null>(null);
	let lastHint = $state<string | null>(null);
	let isSubmitting = $state(false);
	let summary = $state<{ testedPassed: number; assumedMastered: number } | null>(null);

	let answerInput = $state<HTMLInputElement | null>(null);
	let fractionInput = $state<{ focus: () => void } | null>(null);
	let fractionPartInput = $state<{ focus: () => void } | null>(null);
	let mixedPartInput = $state<{ focus: () => void } | null>(null);
	let writtenCalcInput = $state<{ focus: () => void } | null>(null);
	let numberLineInput = $state<{ focus: () => void } | null>(null);

	const WRITTEN_ARITH_ATOMS = new Set([
		'arithmetik__schriftliche_addition',
		'arithmetik__schriftliche_subtraktion',
		'arithmetik__schriftliche_multiplikation',
		'arithmetik__schriftliche_division'
	]);

	function parseWrittenArith(prompt: string): { a: number; b: number; op: '+' | '-' | '×' | ':' } | null {
		let m;
		if ((m = prompt.match(/^(\d+)\s*\+\s*(\d+)/))) return { a: +m[1], b: +m[2], op: '+' };
		if ((m = prompt.match(/^(\d+)\s*[−\-]\s*(\d+)/))) return { a: +m[1], b: +m[2], op: '-' };
		if ((m = prompt.match(/^(\d+)\s*[·×]\s*(\d+)/))) return { a: +m[1], b: +m[2], op: '×' };
		if ((m = prompt.match(/^(\d+)\s*:\s*(\d+)/))) return { a: +m[1], b: +m[2], op: ':' };
		return null;
	}

	const writtenArith = $derived(
		current && WRITTEN_ARITH_ATOMS.has(current.atomId)
			? parseWrittenArith(current.prompt)
			: null
	);

	const isNumberLine = $derived(
		current?.atomId === 'arithmetik__brueche_am_zahlenstrahl' &&
		!!current?.inputData?.totalSections
	);
	const isFractionPart = $derived(current?.inputData?.type === 'fraction_part');
	const isMixedPart = $derived(current?.inputData?.type === 'mixed_part');

	$effect(() => {
		if (phase === 'question' && current) {
			if (isFractionPart) {
				fractionPartInput?.focus();
			} else if (isMixedPart) {
				mixedPartInput?.focus();
			} else if (current.answerType === 'fraction') {
				fractionInput?.focus();
			} else if (writtenArith) {
				writtenCalcInput?.focus();
			} else if (isNumberLine) {
				numberLineInput?.focus();
			} else if (!current.choices && current.answerType !== 'boolean' && current.answerType !== 'comparison') {
				answerInput?.focus();
			}
		}
	});

	let errorMessage = $state('Fehler beim Laden. Bitte Seite neu laden.');

	async function start() {
		phase = 'loading';
		const res = await fetch('/api/placement/start');
		if (!res.ok) {
			if (res.status === 503) {
				errorMessage = 'Die App ist noch nicht vollständig eingerichtet. Bitte wende dich an deine Lehrerin / deinen Lehrer.';
			} else {
				errorMessage = 'Fehler beim Laden. Bitte Seite neu laden.';
			}
			phase = 'error';
			return;
		}
		const data = await res.json();
		if (data.alreadyDone) { goto('/practice'); return; }
		if (data.complete) {
			await finalize(data.state);
			return;
		}
		maxAtoms = data.maxAtoms ?? 15;
		state = data.state;
		current = {
			atomId: data.atomId,
			atomLabel: data.atomLabel,
			taskId: data.taskId,
			prompt: data.prompt,
			answerType: data.answerType,
			choices: data.choices ?? null,
			svg: data.svg ?? null,
			inputData: data.inputData ?? null,
			hint: data.hint
		};
		answer = '';
		phase = 'question';
	}

	async function submitAnswer() {
		if (!current || !state || isSubmitting || !String(answer).trim()) return;
		isSubmitting = true;
		try {
			const res = await fetch('/api/placement/answer', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					atomId: current.atomId,
					taskId: current.taskId,
					answer: String(answer).trim(),
					state
				})
			});
			if (!res.ok) { phase = 'error'; return; }
			const data = await res.json();

			lastCorrect = data.correct;
			lastHint = data.hint ?? null;
			state = data.state;
			phase = 'feedback';

			if (data.complete) {
				await finalize(data.state);
				return;
			}

			// Auto-advance after brief feedback pause
			setTimeout(() => {
				current = {
					atomId: data.atomId,
					atomLabel: data.atomLabel,
					taskId: data.taskId,
					prompt: data.prompt,
					answerType: data.answerType,
					choices: data.choices ?? null,
					svg: data.svg ?? null,
					inputData: data.inputData ?? null,
					hint: data.nextHint ?? null
				};
				answer = '';
				phase = 'question';
			}, 1000);
		} finally {
			isSubmitting = false;
		}
	}

	async function finalize(finalState: PlacementState) {
		const res = await fetch('/api/placement/finalize', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ state: finalState })
		});
		if (!res.ok) { phase = 'error'; return; }
		summary = await res.json();
		phase = 'complete';
	}

	function selectAnswer(value: string) {
		answer = value;
		submitAnswer();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && phase === 'question' && String(answer).trim() && !isSubmitting) {
			submitAnswer();
		}
	}

	// Start on mount
	$effect(() => { start(); });

	const progressLabel = $derived(
		state ? `${state.totalTested} / ~${maxAtoms}` : ''
	);
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="placement-page">
	<div class="placement-header">
		<div class="header-title">Wissensdiagnose</div>
		{#if state && state.totalTested > 0}
			<div class="header-progress">{progressLabel}</div>
		{/if}
	</div>

	<div class="placement-body">

		{#if phase === 'loading'}
			<div class="center-state">
				<div class="spinner"></div>
				<span>Wird vorbereitet…</span>
			</div>

		{:else if phase === 'error'}
			<div class="center-state">
				<div class="error-icon">!</div>
				<p>{errorMessage}</p>
				<button class="btn btn-primary" onclick={start}>Neu laden</button>
			</div>

		{:else if phase === 'complete' && summary}
			<div class="summary-card">
				<img src="/mascot.png" alt="" class="mascot-img" aria-hidden="true" />
				<h2>Diagnose abgeschlossen</h2>
				<p class="summary-sub">
					Wir haben <strong>{summary.testedPassed + summary.assumedMastered} Atome</strong> als
					bekannt eingestuft.
				</p>
				<div class="summary-stats">
					<div class="stat">
						<div class="stat-value">{summary.testedPassed}</div>
						<div class="stat-label">direkt richtig beantwortet</div>
					</div>
					<div class="stat">
						<div class="stat-value">{summary.assumedMastered}</div>
						<div class="stat-label">als bekannt angenommen</div>
					</div>
				</div>
				<p class="summary-note">
					Lücken werden dir im Üben angezeigt. Du kannst jederzeit zurückgehen und
					einzelne Bereiche wiederholen.
				</p>
				<button class="btn btn-primary btn-lg" onclick={() => goto('/practice')}>
					Jetzt üben →
				</button>
			</div>

		{:else if phase === 'feedback'}
			<div class="feedback-banner" class:correct={lastCorrect} class:incorrect={!lastCorrect}>
				<span class="feedback-icon">{lastCorrect ? '✓' : '✗'}</span>
				<span>{lastCorrect ? 'Richtig!' : 'Nicht ganz.'}</span>
				{#if !lastCorrect && lastHint}
					<span class="hint-inline">💡 {lastHint}</span>
				{/if}
			</div>

		{:else if phase === 'question' && current}
			<div class="intro-text">
				Beantworte die Aufgaben ehrlich – wir stellen den Schwierigkeitsgrad automatisch ein.
			</div>
			<div class="task-card">
				<div class="atom-tag">{current.atomLabel}</div>
				{#if current.svg}
					<div class="task-svg">{@html current.svg}</div>
				{/if}
				<MathText text={current.prompt} class="task-prompt" />
				<div class="answer-area">
					{#if current.choices}
						<div class="choice-buttons choice-buttons-multi">
							{#each current.choices as choice}
								<button class="choice-btn" onclick={() => selectAnswer(choice)} disabled={isSubmitting}><MathText text={choice} /></button>
							{/each}
						</div>
					{:else if isFractionPart}
						{@const d = current.inputData as { type: string; missing: 'numerator' | 'denominator'; knownNum?: number; knownDen?: number }}
						<FractionPartInput
							bind:this={fractionPartInput}
							bind:value={answer}
							missingPart={d.missing}
							knownNumerator={d.knownNum}
							knownDenominator={d.knownDen}
							emitFullFraction={current.answerType === 'fraction'}
							disabled={isSubmitting}
							onsubmit={submitAnswer}
						/>
					{:else if isMixedPart}
						{@const d = current.inputData as { type: string; missing: 'whole' | 'numerator'; whole?: number; numerator?: number; denominator: number }}
						<MixedNumberPartInput
							bind:this={mixedPartInput}
							bind:value={answer}
							missingPart={d.missing}
							whole={d.whole}
							numerator={d.numerator}
							denominator={d.denominator}
							disabled={isSubmitting}
							onsubmit={submitAnswer}
						/>
					{:else if current.answerType === 'fraction'}
						<FractionInput bind:this={fractionInput} bind:value={answer} disabled={isSubmitting} numDigits={current.inputData?.numDigits as number | undefined} onsubmit={submitAnswer} />
					{:else if writtenArith}
						{#key current.taskId}
							<WrittenCalcInput bind:this={writtenCalcInput} a={writtenArith.a} b={writtenArith.b} op={writtenArith.op} bind:value={answer} disabled={isSubmitting} onsubmit={submitAnswer} />
						{/key}
					{:else if isNumberLine}
						<NumberLineInput bind:this={numberLineInput} totalSections={current.inputData!.totalSections as number} bind:value={answer} disabled={isSubmitting} onsubmit={submitAnswer} />
					{:else if current.answerType === 'boolean'}
						<div class="choice-buttons">
							<button class="choice-btn choice-btn-nein" onclick={() => selectAnswer('nein')} disabled={isSubmitting}>✗ Nein</button>
							<button class="choice-btn choice-btn-ja" onclick={() => selectAnswer('ja')} disabled={isSubmitting}>✓ Ja</button>
						</div>
					{:else if current.answerType === 'comparison'}
						<div class="choice-buttons">
							<button class="choice-btn choice-btn-symbol" onclick={() => selectAnswer('<')} disabled={isSubmitting}>&lt;</button>
							<button class="choice-btn choice-btn-symbol" onclick={() => selectAnswer('=')} disabled={isSubmitting}>=</button>
							<button class="choice-btn choice-btn-symbol" onclick={() => selectAnswer('>')} disabled={isSubmitting}>&gt;</button>
						</div>
					{:else if current.answerType === 'integer'}
						<input
							bind:this={answerInput}
							class="answer-input"
							type="number"
							inputmode="numeric"
							step="1"
							bind:value={answer}
							disabled={isSubmitting}
							placeholder="Antwort"
							autocomplete="off"
						/>
					{:else if current.answerType === 'number'}
						<input
							bind:this={answerInput}
							class="answer-input"
							type="text"
							inputmode="decimal"
							bind:value={answer}
							disabled={isSubmitting}
							placeholder="z. B. 3,14"
							autocomplete="off"
						/>
					{:else}
						<input
							bind:this={answerInput}
							class="answer-input"
							type="text"
							bind:value={answer}
							disabled={isSubmitting}
							placeholder="Antwort"
							autocomplete="off"
						/>
					{/if}
				</div>
				{#if !current.choices && current.answerType !== 'boolean' && current.answerType !== 'comparison' && !writtenArith}
					<button
						class="btn btn-primary btn-full btn-lg"
						onclick={submitAnswer}
						disabled={isSubmitting || !String(answer).trim()}
					>
						{isSubmitting ? '…' : 'Antworten'}
					</button>
				{/if}
			</div>
		{/if}

	</div>

	{#if phase === 'question'}
		<div class="skip-row">
			<form method="POST" action="?/skip" use:enhance>
				<button type="submit" class="skip-btn">
					Überspringen – ich fange lieber von vorne an
				</button>
			</form>
		</div>
	{/if}
</div>

<style>
	.placement-page {
		min-height: 100%;
		display: flex;
		flex-direction: column;
	}

	.placement-header {
		padding: 1rem 1.25rem 0.75rem;
		border-bottom: 1px solid var(--c-gray-100);
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.header-title {
		font-size: 1rem;
		font-weight: 700;
		color: var(--c-gray-900);
		letter-spacing: .02em;
	}
	.header-progress {
		font-size: 0.85rem;
		color: var(--c-gray-500);
		font-variant-numeric: tabular-nums;
	}

	.placement-body {
		flex: 1;
		padding: 1.5rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-width: 640px;
		width: 100%;
		margin: 0 auto;
	}

	.intro-text {
		font-size: 0.85rem;
		color: var(--c-gray-500);
		text-align: center;
	}

	/* ── Center state (loading / error) ── */
	.center-state {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		color: var(--c-gray-600);
	}
	.error-icon {
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 50%;
		background: var(--c-error);
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 1.25rem;
	}

	/* ── Spinner ── */
	.spinner {
		width: 36px;
		height: 36px;
		border: 3px solid var(--c-gray-200);
		border-top-color: var(--c-primary);
		border-radius: 50%;
		animation: spin .7s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }

	/* ── Task card ── */
	.task-card {
		background: #fff;
		border-radius: var(--radius);
		padding: 1.5rem;
		box-shadow: var(--shadow-sm);
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}
	.task-svg {
		width: 100%;
		overflow: hidden;
		background: var(--c-gray-50);
		border-radius: 0.5rem;
		padding: 0.75rem 0.5rem 0.5rem;
	}
	.atom-tag {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--c-primary);
		text-transform: uppercase;
		letter-spacing: .05em;
	}
	/* .task-prompt lives in app.css (rendered via MathText component) */
	.answer-area {
		display: flex;
		justify-content: center;
	}
	.answer-input {
		width: 100%;
		max-width: 220px;
		padding: 0.75rem 1rem;
		font-size: 1.5rem;
		font-weight: 600;
		text-align: center;
		border: 2px solid var(--c-gray-200);
		border-radius: var(--radius);
		outline: none;
		transition: border-color .15s, box-shadow .15s;
		appearance: none;
		-webkit-appearance: textfield;
		-moz-appearance: textfield;
	}
	.answer-input::-webkit-outer-spin-button,
	.answer-input::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}
	.answer-input:focus {
		border-color: var(--c-primary);
		box-shadow: 0 0 0 3px var(--c-primary-light);
	}

	/* ── Feedback banner ── */
	.feedback-banner {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 1rem 1.25rem;
		border-radius: var(--radius);
		font-weight: 600;
		font-size: 1rem;
	}
	.feedback-banner.correct {
		background: color-mix(in srgb, var(--c-success) 12%, transparent);
		color: var(--c-success);
	}
	.feedback-banner.incorrect {
		background: color-mix(in srgb, var(--c-error) 10%, transparent);
		color: var(--c-error);
	}
	.feedback-icon { font-size: 1.3rem; }
	.hint-inline {
		font-weight: 400;
		font-size: 0.9rem;
		color: inherit;
		opacity: 0.85;
		margin-left: auto;
	}

	/* ── Summary ── */
	.summary-card {
		background: #fff;
		border-radius: var(--radius);
		padding: 2rem 1.5rem;
		box-shadow: var(--shadow-sm);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		text-align: center;
	}
	.mascot-img {
		width: 130px;
		height: auto;
		filter: drop-shadow(0 4px 12px rgba(79, 70, 229, 0.15));
	}
	.summary-card h2 { font-size: 1.4rem; font-weight: 700; }
	.summary-sub { font-size: 1rem; color: var(--c-gray-700); }
	.summary-stats {
		display: flex;
		gap: 1.5rem;
		padding: 1rem 1.5rem;
		background: var(--c-gray-50);
		border-radius: var(--radius);
		width: 100%;
		justify-content: center;
	}
	.stat { display: flex; flex-direction: column; align-items: center; gap: 0.2rem; }
	.stat-value { font-size: 1.75rem; font-weight: 800; color: var(--c-primary); }
	.stat-label { font-size: 0.75rem; color: var(--c-gray-600); }
	.summary-note { font-size: 0.85rem; color: var(--c-gray-500); max-width: 320px; }

	/* ── Choice buttons (boolean / comparison) ── */
	.choice-buttons {
		display: flex;
		gap: 0.75rem;
		justify-content: center;
	}
	.choice-buttons-multi {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
	}
	@media (min-width: 520px) {
		.choice-buttons-multi {
			grid-template-columns: repeat(4, 1fr);
		}
	}
	.choice-btn {
		min-width: 0;
		padding: 0.75rem 0.75rem;
		font-size: 1rem;
		font-weight: 700;
		border: 2px solid var(--c-gray-200);
		border-radius: var(--radius);
		background: #fff;
		color: var(--c-gray-900);
		cursor: pointer;
		transition: border-color .15s, background .15s, box-shadow .15s;
		white-space: normal;
		word-break: break-word;
		line-height: 1.4;
	}
	.choice-btn:hover:not(:disabled) {
		border-color: var(--c-primary);
		background: var(--c-primary-light);
		box-shadow: var(--shadow-sm);
	}
	.choice-btn:disabled { opacity: 0.5; cursor: not-allowed; }
	.choice-btn-symbol {
		min-width: 70px;
		font-size: 1.5rem;
	}
	.choice-btn-nein {
		border-color: var(--c-error);
		color: var(--c-error);
	}
	.choice-btn-nein:hover:not(:disabled) {
		background: var(--c-error-light);
		border-color: var(--c-error);
	}
	.choice-btn-ja {
		border-color: var(--c-success);
		color: var(--c-success);
	}
	.choice-btn-ja:hover:not(:disabled) {
		background: var(--c-success-light);
		border-color: var(--c-success);
	}

	/* ── Skip row ── */
	.skip-row {
		padding: 0.75rem 1.25rem 1.5rem;
		display: flex;
		justify-content: center;
	}
	.skip-btn {
		background: none;
		border: none;
		color: var(--c-gray-400);
		font-size: 0.8rem;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 3px;
		padding: 0.25rem;
	}
	.skip-btn:hover { color: var(--c-gray-600); }
</style>
