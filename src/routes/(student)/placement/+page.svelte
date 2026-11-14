<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import FractionInput from '$lib/components/student/FractionInput.svelte';
	import FractionPartInput from '$lib/components/student/FractionPartInput.svelte';
	import MixedNumberPartInput from '$lib/components/student/MixedNumberPartInput.svelte';
	import WrittenCalcInput from '$lib/components/student/WrittenCalcInput.svelte';
	import NumberLineInput from '$lib/components/student/NumberLineInput.svelte';
	import MathText from '$lib/components/student/MathText.svelte';
	import Icon from '$lib/components/student/Icon.svelte';
	import Ato from '$lib/components/Ato.svelte';
	import NumPad from '$lib/components/student/NumPad.svelte';
	import EquationSteps from '$lib/components/student/EquationSteps.svelte';
	import { findStepEquation } from '$lib/equation.js';
	import { pressKey, numpadInputs, setPadMode, type PadKey } from '$lib/numpad.js';
	import type { PlacementState } from '$lib/server/learning/placement.js';

	type Phase = 'intro' | 'loading' | 'question' | 'feedback' | 'finishing' | 'complete' | 'error';

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

	type Summary = {
		testedPassed: number;
		assumedMastered: number;
		xpGained: number;
		level: number;
		xp: number;
		nextTopic: string | null;
	};

	/** Answer sent for "Weiß ich (noch) nicht" — never matches a real answer. */
	const DONT_KNOW = '__weiss_nicht__';

	let phase = $state<Phase>('intro');
	let current = $state<TaskData | null>(null);
	let pState = $state<PlacementState | null>(null);
	let maxAtoms = $state(15);
	let answer = $state('');
	let lastCorrect = $state<boolean | null>(null);
	let lastWasDontKnow = $state(false);
	let isSubmitting = $state(false);
	let summary = $state<Summary | null>(null);

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
	const locked = $derived(isSubmitting || phase !== 'question');

	// ── Step-by-step mode for linear equations ──
	const stepEq = $derived(
		current && !current.choices && ['integer', 'number', 'fraction'].includes(current.answerType) &&
		!isFractionPart && !isMixedPart && !isNumberLine && !writtenArith
			? findStepEquation(current.prompt)
			: null
	);
	/** Task the step mode was opened for – switching tasks closes it automatically. */
	let stepTaskId = $state<string | null>(null);
	const stepMode = $derived(!!stepEq && !!current && stepTaskId === current.taskId);

	// ── Progress / stars ──
	const tested = $derived(pState?.totalTested ?? 0);
	const questionNo = $derived(Math.min(tested + 1, maxAtoms));
	const progressPct = $derived(Math.round((tested / Math.max(1, maxAtoms)) * 100));
	const minutesLeft = $derived(Math.max(1, Math.round((maxAtoms - tested) * 0.6)));
	const starsFound = $derived(
		pState ? Object.values(pState.tested).filter((r) => r === 'passed').length + pState.propagated.length : 0
	);

	// ── Number pad ──
	// The on-screen pad is always used – the device keyboard is never offered
	const padPreferred = true;
	let coarsePointer = $state(false);
	let cardEl = $state<HTMLElement | null>(null);
	let lastFocusedInput: HTMLInputElement | null = null;
	const padEligible = $derived(
		!!current &&
		!current.choices &&
		current.answerType !== 'boolean' &&
		current.answerType !== 'comparison' &&
		current.answerType !== 'text' &&
		!isNumberLine &&
		!writtenArith
	);
	const showPad = $derived(padEligible && padPreferred && phase === 'question' && !stepMode);
	const simpleNumberField = $derived(
		!!current && (current.answerType === 'integer' || current.answerType === 'number') && !isFractionPart && !isMixedPart
	);

	onMount(() => {
		coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
	});

	function onPad(key: PadKey) {
		if (!cardEl || locked) return;
		pressKey(cardEl, key, lastFocusedInput);
	}

	function trackFocus(e: FocusEvent) {
		if (e.target instanceof HTMLInputElement) lastFocusedInput = e.target;
	}

	$effect(() => {
		if (phase === 'question' && current) {
			if (showPad && coarsePointer && cardEl) setPadMode(cardEl, true);
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

	function toTask(data: Record<string, unknown>, hintKey: 'hint' | 'nextHint'): TaskData {
		return {
			atomId: data.atomId as string,
			atomLabel: data.atomLabel as string,
			taskId: data.taskId as string,
			prompt: data.prompt as string,
			answerType: data.answerType as TaskData['answerType'],
			choices: (data.choices as string[] | null) ?? null,
			svg: (data.svg as string | null) ?? null,
			inputData: (data.inputData as Record<string, unknown> | null) ?? null,
			hint: (data[hintKey] as string | null) ?? null
		};
	}

	async function start() {
		phase = 'loading';
		const res = await fetch('/api/placement/start');
		if (!res.ok) {
			errorMessage = res.status === 503
				? 'Die App ist noch nicht vollständig eingerichtet. Bitte wende dich an deine Lehrkraft.'
				: 'Fehler beim Laden. Bitte Seite neu laden.';
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
		pState = data.state;
		current = toTask(data, 'hint');
		answer = '';
		phase = 'question';
	}

	async function submitAnswer(dontKnow = false) {
		if (!current || !pState || isSubmitting) return;
		if (!dontKnow && !String(answer).trim()) return;
		isSubmitting = true;
		try {
			const res = await fetch('/api/placement/answer', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					atomId: current.atomId,
					taskId: current.taskId,
					answer: dontKnow ? DONT_KNOW : String(answer).trim(),
					state: pState
				})
			});
			if (!res.ok) { phase = 'error'; return; }
			const data = await res.json();

			lastCorrect = data.correct;
			lastWasDontKnow = dontKnow;
			pState = data.state;
			phase = 'feedback';

			if (data.complete) {
				setTimeout(() => finalize(data.state), dontKnow ? 300 : 900);
				return;
			}

			setTimeout(() => {
				current = toTask(data, 'nextHint');
				answer = '';
				phase = 'question';
			}, dontKnow ? 300 : 900);
		} finally {
			isSubmitting = false;
		}
	}

	async function finalize(finalState: PlacementState) {
		phase = 'finishing';
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
		if (e.defaultPrevented) return;
		if (e.key === 'Enter' && phase === 'question' && String(answer).trim() && !isSubmitting) {
			submitAnswer();
		}
	}

	// Positions for the result constellation (lit in order)
	const STARS = [
		[40, 120, 6], [80, 80, 8], [130, 96, 7], [120, 150, 6], [70, 160, 6],
		[180, 70, 8], [230, 90, 7], [215, 140, 6], [165, 150, 6], [280, 60, 6],
		[310, 110, 7], [260, 180, 6], [140, 205, 6], [310, 165, 5]
	] as const;
	const totalStars = $derived(summary ? summary.testedPassed + summary.assumedMastered : 0);
	const litStars = $derived(Math.min(STARS.length, totalStars));
</script>

<svelte:window onkeydown={handleKeydown} />

{#snippet skipForm(dark: boolean)}
	<form method="POST" action="?/skip" use:enhance class="skip-form">
		<button type="submit" class="skip-btn" class:dark>Überspringen – ich fange von vorne an</button>
	</form>
{/snippet}

<div class="placement" class:dark={phase === 'complete' || phase === 'finishing'}>

{#if phase === 'intro'}
	<!-- ═════════ INTRO ═════════ -->
	<div class="intro">
		<div class="intro-hero">
			<svg class="hero-deco" viewBox="0 0 390 330" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
				<g fill="#7dd3fc"><circle cx="40" cy="50" r="2" /><circle cx="120" cy="30" r="1.5" /><circle cx="350" cy="70" r="2" /><circle cx="320" cy="200" r="1.5" /><circle cx="30" cy="190" r="1.5" /></g>
				<g stroke="#fcd34d" stroke-opacity="0.5" stroke-width="1.5" fill="none"><path d="M54 110 L96 86 L130 118" /><path d="M276 104 L318 128 L352 100" /></g>
				<g fill="#2b4a7a"><circle cx="54" cy="110" r="5" /><circle cx="96" cy="86" r="5" /><circle cx="130" cy="118" r="5" /><circle cx="276" cy="104" r="5" /><circle cx="318" cy="128" r="5" /><circle cx="352" cy="100" r="5" /></g>
			</svg>
			<div class="bubble">Ich zeig dir deinen Sternenhimmel!</div>
			<span class="hero-mascot"><Ato mood="freude" size="100%" label="Ato, das Lern-Atom" /></span>
		</div>

		<div class="intro-body">
			<div class="intro-text">
				<h1>Was kannst du schon?</h1>
				<p>Ein kurzer Check, damit du nicht übst, was du längst kannst.</p>
			</div>

			<ul class="facts">
				<li>
					<span class="fact-icon blue"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0b6bcb" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></span>
					<span><strong>Etwa 10 Minuten</strong> – höchstens {maxAtoms} Fragen.</span>
				</li>
				<li>
					<span class="fact-icon green"><Icon name="shield" size={22} color="var(--c-success)" /></span>
					<span><strong>Keine Noten.</strong> Es geht nur darum, wo du startest.</span>
				</li>
				<li>
					<span class="fact-icon orange"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#c2410c" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 9a3 3 0 1 1 4 2.8c-.6.3-1 .9-1 1.6V15" /><circle cx="12" cy="19" r="0.8" fill="#c2410c" /></svg></span>
					<span><strong>„Weiß ich nicht“ ist okay</strong> – besser als raten.</span>
				</li>
			</ul>

			<div class="intro-actions">
				<button class="btn-3d" onclick={start}>
					Check starten <Icon name="arrow" size={22} />
				</button>
				{@render skipForm(false)}
			</div>
		</div>
	</div>

{:else if phase === 'loading' || phase === 'finishing'}
	<div class="center-state">
		<div class="spinner"></div>
		<span>{phase === 'finishing' ? 'Dein Sternenhimmel wird berechnet…' : 'Wird vorbereitet…'}</span>
	</div>

{:else if phase === 'error'}
	<div class="center-state">
		<span class="error-mascot"><Ato mood="denkt" size="100%" /></span>
		<p>{errorMessage}</p>
		<button class="btn-3d" onclick={start}>Nochmal versuchen</button>
	</div>

{:else if phase === 'complete' && summary}
	<!-- ═════════ RESULT ═════════ -->
	<div class="result">
		<div class="result-head">
			<span class="eyebrow">Check geschafft</span>
			<h1>Dein Sternenhimmel<br />ist bereit!</h1>
		</div>

		<div class="sky">
			<svg viewBox="0 0 350 250" role="img" aria-label="Sternbild mit {totalStars} leuchtenden Sternen">
				<g fill="#fff" fill-opacity="0.25"><circle cx="20" cy="20" r="1" /><circle cx="330" cy="40" r="1" /><circle cx="180" cy="236" r="1" /><circle cx="300" cy="220" r="1" /></g>
				<g stroke="#fcd34d" stroke-opacity="0.45" stroke-width="1.6" fill="none">
					<path d="M40 120 L80 80 L130 96 L120 150 L70 160 Z" /><path d="M130 96 L180 70 L230 90 L215 140 L165 150 Z" /><path d="M230 90 L280 60 L310 110" />
				</g>
				<g stroke="#7dd3fc" stroke-opacity="0.4" stroke-width="1.5" stroke-dasharray="4 4" fill="none"><path d="M215 140 L260 180 L310 165" /><path d="M120 150 L140 205" /></g>
				{#each STARS as [x, y, r], i}
					{#if i < litStars}
						<circle cx={x} cy={y} r={r * 2.2} fill="#fcd34d" fill-opacity="0.3" class="glow" style="animation-delay: {i * 70}ms" />
						<circle cx={x} cy={y} r={r} fill="#fcd34d" class="lit" style="animation-delay: {i * 70}ms" />
					{:else}
						<circle cx={x} cy={y} r={r - 1} fill="#2b4a7a" />
					{/if}
				{/each}
			</svg>
			<span class="sky-mascot"><Ato mood="jubel" size="100%" label="Ato freut sich" /></span>
		</div>

		<div class="result-tiles">
			<div class="result-tile gold">
				<strong>{totalStars}</strong>
				<span>{totalStars === 1 ? 'Stern leuchtet' : 'Sterne leuchten'} schon</span>
			</div>
			<div class="result-tile blue">
				<strong>+{summary.xpGained} XP</strong>
				<span>Startbonus · Level {summary.level}</span>
			</div>
		</div>

		{#if totalStars === 0}
			<p class="result-note">Kein Problem – du startest ganz am Anfang und jeder Stern gehört dir.</p>
		{/if}

		{#if summary.nextTopic}
			<div class="next-topic">
				<span class="next-icon"><Icon name="play" size={22} color="var(--c-sky-soft)" /></span>
				<div>
					<span class="eyebrow sky">Dein erster neuer Stern</span>
					<strong>{summary.nextTopic}</strong>
					<span class="next-sub">Passt genau zu dem, was du schon kannst.</span>
				</div>
			</div>
		{/if}

		<div class="result-actions">
			<a href="/practice" class="btn-3d sky" data-sveltekit-reload>Los geht’s</a>
			<a href="/progress" class="result-link" data-sveltekit-reload>Ganze Sternenkarte ansehen</a>
		</div>
	</div>

{:else if current}
	<!-- ═════════ QUESTION ═════════ -->
	<div class="question-view">
		<header class="q-header">
			<div class="q-top">
				<span class="q-title">Wissens-Check</span>
				<span class="stars-chip" aria-label="{starsFound} Sterne gefunden">
					<Icon name="sparkle" size={15} color="var(--c-star)" />
					{starsFound}
				</span>
			</div>
			<div class="q-progress" role="progressbar" aria-label="Frage {questionNo} von ungefähr {maxAtoms}" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progressPct}>
				<span style="width: {Math.max(4, progressPct)}%"></span>
			</div>
			<div class="q-meta"><span>Frage {questionNo} von ca. {maxAtoms}</span><span>noch ~{minutesLeft} Min.</span></div>
		</header>

		<div class="q-body">
			<span class="tag">{current.atomLabel}</span>

			<div class="task-card" class:dimmed={phase === 'feedback'} bind:this={cardEl} onfocusin={trackFocus} use:numpadInputs={showPad && coarsePointer}>
				{#if current.svg}
					<div class="task-svg">{@html current.svg}</div>
				{/if}
				<MathText text={current.prompt} class="task-prompt" />
				<div class="answer-area">
					{#if stepMode && stepEq}
						{#key current.taskId}
							<EquationSteps
								equation={stepEq.eq}
								tex={stepEq.tex}
								answerType={current.answerType}
								disabled={locked}
								onanswer={(v) => { answer = v; submitAnswer(); }}
								onclose={() => (stepTaskId = null)}
							/>
						{/key}
					{:else if current.choices}
						<div class="choice-buttons choice-buttons-multi">
							{#each current.choices as choice}
								<button class="choice-btn" onclick={() => selectAnswer(choice)} disabled={locked}><MathText text={choice} /></button>
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
							disabled={locked}
							onsubmit={() => submitAnswer()}
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
							disabled={locked}
							onsubmit={() => submitAnswer()}
						/>
					{:else if current.answerType === 'fraction'}
						<FractionInput bind:this={fractionInput} bind:value={answer} disabled={locked} numDigits={current.inputData?.numDigits as number | undefined} onsubmit={() => submitAnswer()} />
					{:else if writtenArith}
						{#key current.taskId}
							<WrittenCalcInput bind:this={writtenCalcInput} a={writtenArith.a} b={writtenArith.b} op={writtenArith.op} bind:value={answer} disabled={locked} onsubmit={() => submitAnswer()} />
						{/key}
					{:else if isNumberLine}
						<NumberLineInput bind:this={numberLineInput} totalSections={current.inputData!.totalSections as number} bind:value={answer} disabled={locked} onsubmit={() => submitAnswer()} />
					{:else if current.answerType === 'boolean'}
						<div class="choice-buttons">
							<button class="choice-btn choice-btn-nein" onclick={() => selectAnswer('nein')} disabled={locked}>✗ Nein</button>
							<button class="choice-btn choice-btn-ja" onclick={() => selectAnswer('ja')} disabled={locked}>✓ Ja</button>
						</div>
					{:else if current.answerType === 'comparison'}
						<div class="choice-buttons">
							<button class="choice-btn choice-btn-symbol" onclick={() => selectAnswer('<')} disabled={locked}>&lt;</button>
							<button class="choice-btn choice-btn-symbol" onclick={() => selectAnswer('=')} disabled={locked}>=</button>
							<button class="choice-btn choice-btn-symbol" onclick={() => selectAnswer('>')} disabled={locked}>&gt;</button>
						</div>
					{:else if current.answerType === 'integer'}
						<input
							bind:this={answerInput}
							class="answer-input"
							type="text"
							inputmode="numeric"
							bind:value={answer}
							disabled={locked}
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
							disabled={locked}
							placeholder="z. B. 3,14"
							autocomplete="off"
						/>
					{:else}
						<input
							bind:this={answerInput}
							class="answer-input"
							type="text"
							bind:value={answer}
							disabled={locked}
							placeholder="Antwort"
							autocomplete="off"
						/>
					{/if}
				</div>
				{#if stepEq && !stepMode && phase === 'question'}
					<button class="step-entry" onclick={() => (stepTaskId = current!.taskId)}>
						<Icon name="pencil" size={16} /> Schritt für Schritt lösen
					</button>
				{/if}
			</div>

			{#if phase === 'feedback'}
				<div class="toast" class:good={lastCorrect} aria-live="polite">
					{#if lastCorrect}
						<Icon name="sparkle" size={20} color="var(--c-gold)" /> Stark – ein Stern mehr!
					{:else if lastWasDontKnow}
						<Icon name="check" size={20} color="var(--c-primary)" /> Alles klar – das lernen wir zusammen.
					{:else}
						<Icon name="check" size={20} color="var(--c-primary)" /> Notiert – das üben wir später.
					{/if}
				</div>
			{:else}
				<button class="dont-know" onclick={() => submitAnswer(true)} disabled={isSubmitting}>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 9a3 3 0 1 1 4 2.8c-.6.3-1 .9-1 1.6V15" /><circle cx="12" cy="19" r="0.8" /></svg>
					Weiß ich (noch) nicht
				</button>
			{/if}

			{#if !showPad && phase === 'question' && !current.choices && current.answerType !== 'boolean' && current.answerType !== 'comparison' && !writtenArith && !stepMode}
				<button class="btn-3d q-submit" onclick={() => submitAnswer()} disabled={isSubmitting || !String(answer).trim()}>
					{isSubmitting ? 'Einen Moment…' : 'Weiter'}
				</button>
			{/if}

			{@render skipForm(false)}
		</div>

		{#if showPad}
			<div class="pad-dock">
				<NumPad
					onpress={onPad}
					canSubmit={!!String(answer).trim() && !locked}
					submitting={isSubmitting}
					submitLabel="Weiter"
					showMinus={simpleNumberField}
					showComma={simpleNumberField && current.answerType === 'number'}
				/>
			</div>
		{/if}
	</div>
{/if}
</div>

<style>
	.placement {
		min-height: 100svh;
		display: flex;
		flex-direction: column;
		background: var(--c-ground);
		color: var(--c-navy);
	}
	.placement.dark { background: #081f45; color: #fff; }

	/* ── Intro ── */
	.intro { display: flex; flex-direction: column; flex: 1; }
	.intro-hero {
		position: relative;
		height: min(40svh, 330px);
		min-height: 240px;
		background: var(--c-navy);
		border-radius: 0 0 40px 40px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-end;
		overflow: hidden;
	}
	.hero-deco { position: absolute; inset: 0; width: 100%; height: 100%; }
	.bubble {
		position: absolute; top: 12%; left: 50%; transform: translateX(-50%);
		background: #fff; color: var(--c-navy); font-weight: 800; font-size: 1rem;
		padding: 0.6rem 1rem; border-radius: 18px; white-space: nowrap;
		animation: pop 0.5s 0.2s both cubic-bezier(.2, 1.4, .4, 1);
	}
	@keyframes pop { from { opacity: 0; transform: translateX(-50%) scale(0.6); } }
	.hero-mascot { position: relative; display: block; height: 70%; aspect-ratio: 1; animation: float 4s ease-in-out infinite; }
	@keyframes float { 50% { transform: translateY(-8px); } }
	.intro-body {
		flex: 1; width: 100%; max-width: 480px; margin: 0 auto;
		padding: 1.6rem 1.5rem 1.25rem;
		display: flex; flex-direction: column; gap: 1.1rem;
	}
	.intro-text { text-align: center; display: flex; flex-direction: column; gap: 0.35rem; }
	.intro-text h1 { font-size: 1.75rem; font-weight: 900; letter-spacing: -0.02em; line-height: 1.15; }
	.intro-text p { font-weight: 600; color: var(--c-ink-2); }
	.facts { list-style: none; display: flex; flex-direction: column; gap: 0.6rem; }
	.facts li {
		display: flex; align-items: center; gap: 0.75rem;
		background: #fff; border-radius: 16px; padding: 0.75rem 0.9rem; box-shadow: var(--shadow-sm);
		font-size: 0.95rem; font-weight: 700; color: #34507a;
	}
	.facts strong { color: var(--c-navy); }
	.fact-icon { width: 2.5rem; height: 2.5rem; flex: none; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
	.fact-icon.blue { background: var(--c-primary-light); }
	.fact-icon.green { background: var(--c-success-light); }
	.fact-icon.orange { background: var(--c-orange-light); }
	.intro-actions { margin-top: auto; display: flex; flex-direction: column; gap: 0.25rem; }

	.skip-form { display: flex; justify-content: center; }
	.skip-btn {
		min-height: 2.75rem; background: none; border: 0; cursor: pointer;
		font: 800 0.95rem var(--font); color: var(--c-ink-2);
	}
	.skip-btn:hover { color: var(--c-primary); text-decoration: underline; }

	/* ── States ── */
	.center-state {
		flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
		gap: 1rem; padding: 2rem; text-align: center; font-weight: 700; color: var(--c-ink-2);
	}
	.dark .center-state { color: #bfdbfe; }
	.error-mascot { display: block; width: 110px; height: 110px; }
	.spinner {
		width: 36px; height: 36px; border: 4px solid var(--c-line); border-top-color: var(--c-sky);
		border-radius: 50%; animation: spin .7s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }

	/* ── Question ── */
	.question-view { flex: 1; display: flex; flex-direction: column; width: 100%; max-width: 640px; margin: 0 auto; }
	.q-header { padding: 1rem 1.25rem 0.25rem; display: flex; flex-direction: column; gap: 0.6rem; }
	.q-top { display: flex; align-items: center; justify-content: space-between; min-height: 2.75rem; }
	.q-title { font-size: 1.05rem; font-weight: 900; }
	.stars-chip {
		display: inline-flex; align-items: center; gap: 0.3rem;
		background: var(--c-navy); color: var(--c-star); font-weight: 900; font-size: 0.95rem;
		padding: 0.35rem 0.7rem; border-radius: 999px;
	}
	.q-progress { height: 0.75rem; background: var(--c-line); border-radius: 999px; overflow: hidden; }
	.q-progress span { display: block; height: 100%; background: var(--c-sky); border-radius: 999px; transition: width .45s ease; }
	.q-meta { display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 800; color: var(--c-ink-2); }
	.q-body { flex: 1; padding: 0.75rem 1.25rem 1rem; display: flex; flex-direction: column; gap: 0.9rem; }

	.task-card {
		background: #fff; border-radius: 24px; padding: 1.4rem 1.25rem; box-shadow: var(--shadow-sm);
		display: flex; flex-direction: column; gap: 1.1rem; transition: opacity .2s;
	}
	.task-card.dimmed { opacity: 0.55; }
	.task-svg { width: 100%; overflow: hidden; background: var(--c-ground); border-radius: 12px; padding: 0.75rem 0.5rem 0.5rem; }

	.toast {
		align-self: center; display: inline-flex; align-items: center; gap: 0.5rem;
		background: #fff; border: 2px solid var(--c-line); border-radius: 999px;
		padding: 0.55rem 1.1rem; font-weight: 800; animation: rise .25s both;
	}
	.toast.good { background: #fef3c7; border-color: #fcd34d; color: #78350f; }
	@keyframes rise { from { transform: translateY(8px); opacity: 0; } }
	.dont-know {
		align-self: center; min-height: 2.75rem; display: inline-flex; align-items: center; gap: 0.5rem;
		background: #fff; border: 2px solid var(--c-line); color: var(--c-ink-2); border-radius: 999px;
		padding: 0.45rem 1.1rem; font: 800 0.95rem var(--font); cursor: pointer;
	}
	.dont-know:hover:not(:disabled) { border-color: var(--c-sky); color: var(--c-primary-dark); }
	.dont-know:disabled { opacity: 0.5; }
	.q-submit { width: 100%; }
	.step-entry {
		align-self: center; display: inline-flex; align-items: center; gap: 0.4rem; min-height: 2.5rem;
		background: var(--c-orange-light); border: 2px solid var(--c-orange); color: var(--c-orange-text);
		border-radius: 999px; padding: 0.35rem 1rem; font: 900 0.9rem var(--font); cursor: pointer;
	}
	.step-entry:hover { background: #ffe4cc; }
	.pad-dock { position: sticky; bottom: 0; margin-top: auto; z-index: 2; }

	/* answer inputs (shared look with the practice page) */
	.answer-area { display: flex; justify-content: center; }
	.answer-input {
		width: 100%; max-width: 220px; padding: 0.75rem 1rem;
		font: 800 1.5rem var(--font); text-align: center; color: var(--c-navy);
		border: 2px solid var(--c-line); border-radius: 14px; outline: none;
		transition: border-color .15s, box-shadow .15s;
	}
	.answer-input:focus { border-color: var(--c-sky); box-shadow: 0 0 0 3px var(--c-primary-light); }
	.choice-buttons { display: flex; gap: 0.75rem; justify-content: center; }
	.choice-buttons-multi { display: grid; grid-template-columns: repeat(2, 1fr); }
	@media (min-width: 520px) { .choice-buttons-multi { grid-template-columns: repeat(4, 1fr); } }
	.choice-btn {
		min-width: 0; padding: 0.75rem; font: 800 1rem var(--font); line-height: 1.4;
		border: 2px solid var(--c-line); border-radius: 14px; background: #fff; color: var(--c-navy);
		box-shadow: 0 3px 0 var(--c-line); cursor: pointer; white-space: normal; word-break: break-word;
	}
	.choice-btn:hover:not(:disabled) { border-color: var(--c-primary); background: var(--c-primary-light); }
	.choice-btn:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 1px 0 var(--c-line); }
	.choice-btn:disabled { opacity: 0.5; cursor: not-allowed; }
	.choice-btn-symbol { min-width: 70px; font-size: 1.5rem; }

	/* ── Result ── */
	.result {
		flex: 1; width: 100%; max-width: 480px; margin: 0 auto;
		padding: 1.6rem 1.25rem calc(1.25rem + env(safe-area-inset-bottom, 0px));
		display: flex; flex-direction: column; gap: 1rem;
	}
	.result-head { text-align: center; display: flex; flex-direction: column; gap: 0.25rem; }
	.eyebrow { font-size: 0.8rem; font-weight: 900; color: var(--c-star); text-transform: uppercase; letter-spacing: 0.08em; }
	.eyebrow.sky { color: var(--c-sky-soft); }
	.result-head h1 { font-size: 1.8rem; font-weight: 900; letter-spacing: -0.02em; line-height: 1.15; }
	.sky { position: relative; }
	.sky svg { display: block; width: 100%; height: auto; }
	.lit { animation: twinkle-in .5s both; transform-box: fill-box; transform-origin: center; }
	.glow { animation: fade-in .8s both; }
	@keyframes twinkle-in { from { transform: scale(0); opacity: 0; } 60% { transform: scale(1.4); } }
	@keyframes fade-in { from { opacity: 0; } }
	.sky-mascot { display: block; position: absolute; right: -6px; bottom: -14px; width: 110px; height: 110px; }
	.result-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.6rem; }
	.result-tile {
		background: #fff; color: var(--c-navy); border-radius: 18px; padding: 0.75rem 0.9rem;
		display: flex; flex-direction: column; gap: 0.1rem; border-bottom: 5px solid var(--c-line);
	}
	.result-tile.gold { border-bottom-color: var(--c-gold); }
	.result-tile.blue { border-bottom-color: var(--c-primary); }
	.result-tile strong { font-size: 1.6rem; font-weight: 900; }
	.result-tile span { font-size: 0.8rem; font-weight: 800; color: var(--c-ink-2); }
	.result-note { font-weight: 700; color: #bfdbfe; text-align: center; }
	.next-topic {
		background: var(--c-navy-2); border: 2px solid #2b5a9e; border-radius: 20px;
		padding: 0.85rem 1rem; display: flex; align-items: center; gap: 0.85rem;
	}
	.next-topic > div { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
	.next-topic strong { font-size: 1.05rem; font-weight: 900; }
	.next-icon {
		width: 2.9rem; height: 2.9rem; flex: none; border-radius: 50%;
		background: #081f45; border: 3px solid var(--c-sky-soft);
		display: flex; align-items: center; justify-content: center;
	}
	.next-sub { font-size: 0.8rem; font-weight: 700; color: #bfdbfe; }
	.result-actions { margin-top: auto; display: flex; flex-direction: column; gap: 0.35rem; }
	.result-link {
		min-height: 2.75rem; display: flex; align-items: center; justify-content: center;
		color: #fff; font-weight: 800; text-decoration: none;
	}
	.result-link:hover { text-decoration: underline; }
</style>
