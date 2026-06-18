<script lang="ts">
	import { invalidate } from '$app/navigation';
	import type { PageData } from './$types';
	import FractionInput from '$lib/components/student/FractionInput.svelte';
	import WrittenCalcInput from '$lib/components/student/WrittenCalcInput.svelte';
	import NumberLineInput from '$lib/components/student/NumberLineInput.svelte';
	import MathText from '$lib/components/student/MathText.svelte';
	import AtomExplanation from '$lib/components/student/AtomExplanation.svelte';
	import WrittenCalcFeedback from '$lib/components/student/WrittenCalcFeedback.svelte';

	let { data }: { data: PageData } = $props();

	type TaskDisplay = {
		taskId: string;
		atomId: string;
		prompt: string;
		answerType: 'integer' | 'number' | 'fraction' | 'text' | 'boolean' | 'comparison';
		choices: string[] | null;
		svg: string | null;
		inputData: Record<string, unknown> | null;
		hint: string | null;
		difficulty: number | null;
		explanation: string | null;
		illustrationConfig: Record<string, unknown> | null;
	};

	type AttemptResult = {
		correct: boolean;
		mastery: number;
		justMastered: boolean;
		xpGained: number;
		newLevel: number;
		levelUp: boolean;
		newBadges: string[];
		streakDays: number;
		hint?: string;
		correctAnswer?: string;
		submittedAnswer?: string;
	};

	type FrontierItem = (typeof data.plan.frontierItems)[0];

	// ── Phase ──
	let phase = $state<'reviews' | 'practice'>(
		data.plan.mandatoryReviews.length > 0 ? 'reviews' : 'practice'
	);

	// ── Review state ──
	let reviewIndex = $state(0);
	let reviews = $state(data.plan.mandatoryReviews);
	let currentReview = $derived(reviews[reviewIndex] ?? null);

	// ── Practice state ──
	let selectedAtom = $state<FrontierItem | null>(null);
	let masteredAtomIds = $state(new Set<string>());
	let availableItems = $derived(data.plan.frontierItems.filter(item => !masteredAtomIds.has(item.atomId)));

	// ── Task + answer state ──
	let currentTask = $state<TaskDisplay | null>(null);
	let answer = $state('');
	let isLoading = $state(false);
	let isSubmitting = $state(false);
	let recentPrompts: string[] = [];

	// ── Input refs for auto-focus ──
	let answerInput = $state<HTMLInputElement | null>(null);
	let fractionInput = $state<{ focus: () => void } | null>(null);
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
		currentTask && WRITTEN_ARITH_ATOMS.has(currentTask.atomId)
			? parseWrittenArith(currentTask.prompt)
			: null
	);

	const isNumberLine = $derived(
		currentTask?.atomId === 'arithmetik__brueche_am_zahlenstrahl' &&
		!!currentTask?.inputData?.totalSections
	);

	$effect(() => {
		if (currentTask && !showFeedback) {
			if (currentTask.answerType === 'fraction') {
				fractionInput?.focus();
			} else if (writtenArith) {
				writtenCalcInput?.focus();
			} else if (isNumberLine) {
				numberLineInput?.focus();
			} else if (!currentTask.choices && currentTask.answerType !== 'boolean' && currentTask.answerType !== 'comparison') {
				answerInput?.focus();
			}
		}
	});

	// ── Explanation state ──
	let showExplanationManual = $state(false); // toggled via ? button
	let hadWrongAttempt = $state(false);       // auto-show after wrong answer

	// ── Feedback state ──
	let showFeedback = $state(false);
	let lastResult = $state<AttemptResult | null>(null);
	let autoAdvanceTimer = $state<ReturnType<typeof setTimeout> | null>(null);

	// Load first review on mount
	$effect(() => {
		if (phase === 'reviews' && currentReview) {
			loadTask(currentReview.atomId);
		}
	});

	async function loadTask(atomId: string) {
		isLoading = true;
		currentTask = null;
		answer = '';
		showFeedback = false;
		lastResult = null;
		showExplanationManual = false;
		hadWrongAttempt = false;
		try {
			const params = new URLSearchParams();
			recentPrompts.slice(-5).forEach(p => params.append('ex', p));
			const qs = params.toString();
			const res = await fetch(`/api/task/${atomId}${qs ? '?' + qs : ''}`);
			if (!res.ok) throw new Error();
			const task = await res.json();
			currentTask = task;
			recentPrompts = [...recentPrompts, task.prompt].slice(-10);
		} catch {
			// fall-through: isLoading = false shows error state via null task
		} finally {
			isLoading = false;
		}
	}

	async function submitAnswer() {
		if (!currentTask || isSubmitting || !String(answer).trim()) return;
		const atomId = phase === 'reviews' ? currentReview!.atomId : selectedAtom!.atomId;
		isSubmitting = true;
		try {
			const res = await fetch('/api/attempt', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ taskId: currentTask.taskId, atomId, answer: String(answer).trim(), isReview: phase === 'reviews' })
			});
			if (!res.ok) throw new Error();
			lastResult = await res.json();
			showFeedback = true;
			if (!lastResult.correct) hadWrongAttempt = true;
			invalidate('app:gami');
			invalidate('app:progress');
			if (lastResult.justMastered) {
				invalidate('app:practice');
			}
			if (lastResult.correct && !lastResult.justMastered && !lastResult.levelUp && lastResult.newBadges.length === 0) {
				autoAdvanceTimer = setTimeout(() => {
					autoAdvanceTimer = null;
					handleContinue();
				}, 1500);
			}
		} catch {
			// show generic error?
		} finally {
			isSubmitting = false;
		}
	}

	function handleContinue() {
		if (autoAdvanceTimer !== null) {
			clearTimeout(autoAdvanceTimer);
			autoAdvanceTimer = null;
		}
		if (phase === 'reviews') {
			const next = reviewIndex + 1;
			if (next >= reviews.length) {
				startPracticePhase();
			} else {
				reviewIndex = next;
				loadTask(reviews[next].atomId);
			}
		} else {
			if (lastResult?.justMastered) {
				masteredAtomIds = new Set([...masteredAtomIds, selectedAtom!.atomId]);
				selectedAtom = null;
				currentTask = null;
				showFeedback = false;
			} else {
				loadTask(selectedAtom!.atomId);
			}
		}
	}

	function startPracticePhase() {
		showFeedback = false;
		currentTask = null;
		phase = 'practice';
	}

	function selectAtom(item: FrontierItem) {
		selectedAtom = item;
		loadTask(item.atomId);
	}

	function selectAnswer(value: string) {
		answer = value;
		submitAnswer();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			if (showFeedback && !isSubmitting) {
				handleContinue();
			} else if (String(answer).trim() && !isSubmitting) {
				submitAnswer();
			}
		}
	}

	const BADGE_LABELS: Record<string, string> = {
		first_atom:       '🌱 Erster Schritt – Atom gemeistert!',
		atoms_5:          '📚 Abel – 5 Atome gemeistert!',
		atoms_10:         '📖 Thales – 10 Atome gemeistert!',
		atoms_25:         '🌿 Fibonacci – 25 Atome gemeistert!',
		atoms_50:         '💡 Leibniz – 50 Atome gemeistert!',
		atoms_all:        '🏆 Gauß – Alle Atome gemeistert!',
		streak_3:         '🔥 Hypatia – 3 Tage Streak!',
		streak_7:         '🔥 Pythagoras – 7 Tage Streak!',
		streak_30:        '🔥 Archimedes – 30 Tage Streak!',
		streak_100:       '🔥 Ramanujan – 100 Tage Streak!',
		xp_100:           '⭐ Euklid – 100 XP erreicht!',
		xp_500:           '🌟 Kepler – 500 XP erreicht!',
		xp_1500:          '💫 Descartes – 1.500 XP erreicht!',
		xp_4000:          '⚡ Newton – 4.000 XP erreicht!',
		xp_8000:          '💎 Euler – 8.000 XP erreicht!',
		cluster_complete: '📦 Bereich abgeschlossen!'
	};

	function masteryBar(mastery: number): string {
		const pct = Math.round(mastery * 100);
		return `${pct}%`;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="practice-page">

	<!-- ── Practice: atom selection ── -->
	{#if phase === 'practice' && !selectedAtom}
		<div class="selection-page">
			<div class="selection-header">
				<h2>Was möchtest du üben?</h2>
				<p class="text-muted">Wähle ein Thema aus</p>
			</div>
			{#if availableItems.length === 0}
				<div class="screen-center">
					<div class="empty-state">
						<img src="/mascot.png" alt="" class="mascot-img" aria-hidden="true" />
						<h3>Super gemacht!</h3>
						<p>Alle verfügbaren Atome gemeistert. Schau in deinen Fortschritt!</p>
						<a href="/progress" class="btn btn-primary">Zum Fortschritt</a>
					</div>
				</div>
			{:else}
				<div class="atom-grid">
					{#each availableItems as item}
						<button class="atom-card" onclick={() => selectAtom(item)}>
							<div class="atom-type-badge" class:is-active={item.type === 'active'}>
								{item.type === 'active' ? 'Weiterüben' : 'Neu'}
							</div>
							<div class="atom-card-label">{item.label}</div>
							{#if item.mastery > 0}
								<div class="atom-progress-track">
									<div class="atom-progress-fill" style="width: {masteryBar(item.mastery)}"></div>
								</div>
								<div class="atom-mastery-pct">{Math.round(item.mastery * 100)}%</div>
							{/if}
						</button>
					{/each}
				</div>
			{/if}
		</div>

	<!-- ── Task view (reviews + practice) ── -->
	{:else}
		{@const activeItem = phase === 'reviews' ? currentReview : selectedAtom}

		<!-- Progress indicator for reviews -->
		{#if phase === 'reviews'}
			<div class="review-progress-bar">
				<div class="review-progress-label">
					Wiederholung {reviewIndex + 1} von {reviews.length}
				</div>
				<div class="review-track">
					{#each reviews as _, i}
						<div class="review-dot" class:done={i < reviewIndex} class:current={i === reviewIndex}></div>
					{/each}
				</div>
			</div>
		{:else}
			<div class="back-bar">
				<button class="back-btn" onclick={() => { selectedAtom = null; currentTask = null; invalidate('app:practice'); }}>
					← Zurück
				</button>
				<span class="back-label">{selectedAtom?.label}</span>
			</div>
		{/if}

		<!-- Task card -->
		<div class="task-area">
			{#if isLoading}
				<div class="task-loading">
					<div class="spinner"></div>
					<span>Aufgabe laden…</span>
				</div>
			{:else if !currentTask}
				<div class="task-error">
					<p>Aufgabe konnte nicht geladen werden.</p>
					<button class="btn btn-outline" onclick={() => activeItem && loadTask(activeItem.atomId)}>
						Nochmal versuchen
					</button>
				</div>
			{:else if showFeedback && lastResult}
				<!-- Feedback overlay -->
				<div class="feedback-card" class:correct={lastResult.correct} class:incorrect={!lastResult.correct}>
					<div class="feedback-icon">{lastResult.correct ? '✓' : '✗'}</div>
					<div class="feedback-text">
						{lastResult.correct ? 'Richtig!' : 'Nicht ganz.'}
					</div>

					{#if !lastResult.correct && (lastResult.submittedAnswer || lastResult.correctAnswer)}
						{#if writtenArith && lastResult.submittedAnswer && lastResult.correctAnswer}
							<WrittenCalcFeedback
								a={writtenArith.a}
								b={writtenArith.b}
								op={writtenArith.op}
								submittedAnswer={lastResult.submittedAnswer}
								correctAnswer={lastResult.correctAnswer}
							/>
						{:else}
							<div class="answer-comparison">
								{#if lastResult.submittedAnswer}
									<div class="answer-row answer-row-wrong">
										<span class="answer-label">Deine Antwort:</span>
										<span class="answer-value"><MathText text={lastResult.submittedAnswer} /></span>
									</div>
								{/if}
								{#if lastResult.correctAnswer}
									<div class="answer-row answer-row-correct">
										<span class="answer-label">Richtige Antwort:</span>
										<span class="answer-value"><MathText text={lastResult.correctAnswer} /></span>
									</div>
								{/if}
							</div>
						{/if}
					{/if}

					{#if lastResult.xpGained > 0}
						<div class="xp-gained">+{lastResult.xpGained} XP</div>
					{/if}

					{#if lastResult.levelUp}
						<div class="level-up">
							<img src="/mascot.png" alt="" class="mascot-inline" aria-hidden="true" />
							Level {lastResult.newLevel} erreicht – weiter so!
						</div>
					{/if}

					{#if lastResult.justMastered}
						<div class="mastered-notice">⭐ Gemeistert!</div>
					{/if}

					{#if lastResult.newBadges.length > 0}
						<div class="new-badges">
							{#each lastResult.newBadges as badge}
								<div class="badge-notice">{BADGE_LABELS[badge] ?? badge}</div>
							{/each}
						</div>
					{/if}

					{#if !lastResult.correct && currentTask?.explanation}
						<AtomExplanation text={currentTask.explanation} illustrationConfig={currentTask.illustrationConfig} />
					{:else if !lastResult.correct && lastResult.hint}
						<div class="hint-box">💡 <MathText text={lastResult.hint} /></div>
					{/if}

					<button class="btn btn-primary btn-full btn-lg continue-btn" onclick={handleContinue}>
						{#if phase === 'reviews' && reviewIndex + 1 < reviews.length}
							Weiter →
						{:else if phase === 'reviews'}
							Zur freien Übung →
						{:else if lastResult?.justMastered}
							Anderes Thema wählen →
						{:else}
							Neue Aufgabe
						{/if}
					</button>
				</div>
			{:else}
				<!-- Task prompt + answer input -->
				<div class="task-card">
					<div class="task-card-header">
						<div class="atom-label-tag">{activeItem?.label}</div>
						{#if currentTask.explanation}
							<button
								class="explanation-toggle"
								class:active={showExplanationManual || hadWrongAttempt}
								onclick={() => showExplanationManual = !showExplanationManual}
								aria-label="Erklärung anzeigen"
								title="Erklärung"
							>?</button>
						{/if}
					</div>
					{#if (showExplanationManual || hadWrongAttempt) && currentTask.explanation}
						<AtomExplanation text={currentTask.explanation} illustrationConfig={currentTask.illustrationConfig} />
					{/if}
					{#if currentTask.svg}
						<div class="task-svg">{@html currentTask.svg}</div>
					{/if}
					<MathText text={currentTask.prompt} class="task-prompt" />

					<div class="answer-area">
						{#if currentTask.choices}
							<div class="choice-buttons">
								{#each currentTask.choices as choice}
									<button class="choice-btn" onclick={() => selectAnswer(choice)} disabled={isSubmitting}><MathText text={choice} /></button>
								{/each}
							</div>
						{:else if currentTask.answerType === 'fraction'}
							<FractionInput bind:this={fractionInput} bind:value={answer} disabled={isSubmitting} numDigits={currentTask.inputData?.numDigits as number | undefined} onsubmit={submitAnswer} />
						{:else if writtenArith}
							{#key currentTask.taskId}
								<WrittenCalcInput bind:this={writtenCalcInput} a={writtenArith.a} b={writtenArith.b} op={writtenArith.op} bind:value={answer} disabled={isSubmitting} onsubmit={submitAnswer} />
							{/key}
						{:else if isNumberLine}
							<NumberLineInput bind:this={numberLineInput} totalSections={currentTask.inputData!.totalSections as number} bind:value={answer} disabled={isSubmitting} onsubmit={submitAnswer} />
						{:else if currentTask.answerType === 'boolean'}
							<div class="choice-buttons">
								<button class="choice-btn choice-btn-nein" onclick={() => selectAnswer('nein')} disabled={isSubmitting}>✗ Nein</button>
								<button class="choice-btn choice-btn-ja" onclick={() => selectAnswer('ja')} disabled={isSubmitting}>✓ Ja</button>
							</div>
						{:else if currentTask.answerType === 'comparison'}
							<div class="choice-buttons">
								<button class="choice-btn choice-btn-symbol" onclick={() => selectAnswer('<')} disabled={isSubmitting}>&lt;</button>
								<button class="choice-btn choice-btn-symbol" onclick={() => selectAnswer('=')} disabled={isSubmitting}>=</button>
								<button class="choice-btn choice-btn-symbol" onclick={() => selectAnswer('>')} disabled={isSubmitting}>&gt;</button>
							</div>
						{:else if currentTask.answerType === 'integer'}
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
						{:else if currentTask.answerType === 'number'}
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

					{#if !currentTask.choices && currentTask.answerType !== 'boolean' && currentTask.answerType !== 'comparison' && !writtenArith}
						<button
							class="btn btn-primary btn-full btn-lg submit-btn"
							onclick={submitAnswer}
							disabled={isSubmitting || !String(answer).trim()}
						>
							{isSubmitting ? '…' : 'Antworten'}
						</button>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.practice-page {
		min-height: 100%;
		display: flex;
		flex-direction: column;
	}

	/* ── Screen-center helper ── */
	.screen-center {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
	}

	/* ── Selection page ── */
	.selection-page {
		padding: 1.25rem;
		max-width: 640px;
		margin: 0 auto;
		width: 100%;
	}
	.selection-header {
		margin-bottom: 1.25rem;
	}
	.selection-header h2 { font-size: 1.25rem; font-weight: 700; }
	.text-muted { color: var(--c-gray-600); font-size: 0.9rem; margin-top: 0.25rem; }

	.atom-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 0.75rem;
		max-width: 900px;
	}
	.atom-card {
		background: #fff;
		border: 2px solid var(--c-gray-200);
		border-radius: var(--radius);
		padding: 0.9rem 0.75rem;
		text-align: left;
		cursor: pointer;
		transition: border-color .15s, box-shadow .15s;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.atom-card:hover, .atom-card:focus-visible {
		border-color: var(--c-primary);
		box-shadow: var(--shadow-sm);
		outline: none;
	}
	.atom-type-badge {
		font-size: 0.65rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: .04em;
		color: #fff;
		background: var(--c-gray-400);
		border-radius: 999px;
		padding: 0.15rem 0.5rem;
		align-self: flex-start;
	}
	.atom-type-badge.is-active { background: var(--c-primary); }
	.atom-card-label {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--c-gray-900);
		line-height: 1.3;
		overflow-wrap: break-word;
		word-break: break-word;
	}
	.atom-progress-track {
		height: 5px;
		background: var(--c-gray-200);
		border-radius: 999px;
		overflow: hidden;
	}
	.atom-progress-fill {
		height: 100%;
		background: var(--c-primary);
		border-radius: 999px;
	}
	.atom-mastery-pct {
		font-size: 0.7rem;
		color: var(--c-gray-600);
	}

	/* ── Empty state ── */
	.empty-state {
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}
	.mascot-inline {
		width: 48px;
		height: auto;
		vertical-align: middle;
		margin-right: 0.35rem;
	}

	/* ── Review progress bar ── */
	.review-progress-bar {
		padding: 0.75rem 1.25rem 0;
		max-width: 640px;
		width: 100%;
		margin: 0 auto;
	}
	.review-progress-label {
		font-size: 0.8rem;
		color: var(--c-gray-600);
		margin-bottom: 0.4rem;
	}
	.review-track {
		display: flex;
		gap: 0.35rem;
	}
	.review-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--c-gray-200);
		flex-shrink: 0;
	}
	.review-dot.done { background: var(--c-success); }
	.review-dot.current { background: var(--c-primary); }

	/* ── Back bar ── */
	.back-bar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 1rem;
		border-bottom: 1px solid var(--c-gray-100);
		max-width: 640px;
		width: 100%;
		margin: 0 auto;
	}
	.back-btn {
		background: none;
		border: none;
		color: var(--c-primary);
		font-size: 0.9rem;
		font-weight: 600;
		padding: 0.25rem 0;
		cursor: pointer;
	}
	.back-label {
		font-size: 0.9rem;
		color: var(--c-gray-700);
		font-weight: 500;
	}

	/* ── Task area ── */
	.task-area {
		flex: 1;
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		max-width: 640px;
		width: 100%;
		margin: 0 auto;
	}

	.task-loading, .task-error {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		color: var(--c-gray-600);
	}

	/* Spinner */
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
	.task-card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.explanation-toggle {
		flex-shrink: 0;
		width: 1.6rem;
		height: 1.6rem;
		border-radius: 50%;
		border: 2px solid var(--c-gray-400);
		background: #fff;
		color: var(--c-gray-600);
		font-size: 0.8rem;
		font-weight: 700;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: border-color 0.15s, background 0.15s, color 0.15s;
	}
	.explanation-toggle:hover {
		border-color: var(--c-primary);
		color: var(--c-primary);
	}
	.explanation-toggle.active {
		border-color: var(--c-primary);
		background: var(--c-primary-light);
		color: var(--c-primary);
	}
	.atom-label-tag {
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
	.submit-btn { margin-top: 0.25rem; }

	/* ── Choice buttons (boolean / comparison) ── */
	.choice-buttons {
		display: flex;
		gap: 0.75rem;
		justify-content: center;
	}
	.choice-btn {
		min-width: 90px;
		padding: 0.85rem 1.5rem;
		font-size: 1.1rem;
		font-weight: 700;
		border: 2px solid var(--c-gray-200);
		border-radius: var(--radius);
		background: #fff;
		color: var(--c-gray-900);
		cursor: pointer;
		transition: border-color .15s, background .15s, box-shadow .15s;
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

	/* ── Feedback card ── */
	.feedback-card {
		background: #fff;
		border-radius: var(--radius);
		padding: 1.75rem 1.5rem;
		box-shadow: var(--shadow-sm);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		text-align: center;
		border-top: 4px solid var(--c-gray-200);
	}
	.feedback-card.correct { border-top-color: var(--c-success); }
	.feedback-card.incorrect { border-top-color: var(--c-error); }
	.feedback-icon {
		font-size: 3rem;
		line-height: 1;
	}
	.feedback-card.correct .feedback-icon { color: var(--c-success); }
	.feedback-card.incorrect .feedback-icon { color: var(--c-error); }
	.feedback-text {
		font-size: 1.25rem;
		font-weight: 700;
	}
	.feedback-card.correct .feedback-text { color: var(--c-success); }
	.feedback-card.incorrect .feedback-text { color: var(--c-error); }
	.xp-gained {
		font-size: 1rem;
		font-weight: 700;
		color: #f59e0b;
	}
	.level-up {
		font-size: 1rem;
		font-weight: 700;
		color: var(--c-primary);
	}
	.mastered-notice {
		font-size: 1rem;
		font-weight: 600;
		color: var(--c-success);
	}
	.new-badges {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		width: 100%;
	}
	.badge-notice {
		background: var(--c-primary-light);
		color: var(--c-primary-dark);
		border-radius: var(--radius);
		padding: 0.4rem 0.75rem;
		font-size: 0.9rem;
		font-weight: 600;
	}
	.hint-box {
		background: var(--c-warning-light);
		color: var(--c-warning);
		border-radius: var(--radius);
		padding: 0.6rem 0.75rem;
		font-size: 0.9rem;
		width: 100%;
		text-align: left;
	}
	.continue-btn { margin-top: 0.5rem; }

	/* ── Answer comparison (wrong feedback) ── */
	.answer-comparison {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		border-radius: var(--radius);
		overflow: hidden;
		font-size: 1rem;
	}
	.answer-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.5rem 0.75rem;
	}
	.answer-row-wrong {
		background: color-mix(in srgb, var(--c-error) 8%, transparent);
	}
	.answer-row-correct {
		background: color-mix(in srgb, var(--c-success) 8%, transparent);
	}
	.answer-label {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--c-gray-600);
		white-space: nowrap;
	}
	.answer-value {
		font-size: 1rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.answer-row-wrong .answer-value { color: var(--c-error); }
	.answer-row-correct .answer-value { color: var(--c-success); }
</style>
