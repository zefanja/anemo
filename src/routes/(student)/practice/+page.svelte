
<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { invalidate } from '$app/navigation';
	import type { PageData } from './$types';
	import FractionInput from '$lib/components/student/FractionInput.svelte';
	import FractionPartInput from '$lib/components/student/FractionPartInput.svelte';
	import MixedNumberPartInput from '$lib/components/student/MixedNumberPartInput.svelte';
	import WrittenCalcInput from '$lib/components/student/WrittenCalcInput.svelte';
	import NumberLineInput from '$lib/components/student/NumberLineInput.svelte';
	import ZahlenmauernInput from '$lib/components/student/ZahlenmauernInput.svelte';
	import MathText from '$lib/components/student/MathText.svelte';
	import AtomExplanation from '$lib/components/student/AtomExplanation.svelte';
	import WrittenCalcFeedback from '$lib/components/student/WrittenCalcFeedback.svelte';
	import Icon from '$lib/components/student/Icon.svelte';
	import Ato from '$lib/components/Ato.svelte';
	import NumPad from '$lib/components/student/NumPad.svelte';
	import EquationSteps from '$lib/components/student/EquationSteps.svelte';
	import { findStepEquation } from '$lib/equation.js';
	import LevelUpOverlay from '$lib/components/student/LevelUpOverlay.svelte';
	import { pressKey, numpadInputs, setPadMode, type PadKey } from '$lib/numpad.js';
	import { ui } from '$lib/stores/ui.svelte.js';
	import { BADGE_BY_TYPE, greeting, levelProgress } from '$lib/gamification.js';

	let { data }: { data: PageData } = $props();

	type TaskDisplay = {
		taskId: string;
		key?: string;
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
		newXp: number;
		newLevel: number;
		levelUp: boolean;
		newBadges: string[];
		streakDays: number;
		combo: number;
		comboBonus: number;
		dailyXp: number;
		dailyGoal: number;
		dailyGoalReached: boolean;
		streakFreezes: number;
		freezeUsed: boolean;
		freezeEarned: boolean;
		hint?: string;
		why?: string;
		correctAnswer?: string;
		submittedAnswer?: string;
	};

	type FrontierItem = (typeof data.plan.frontierItems)[0];

	/** Tasks per practice round — after a round the session summary is shown. */
	const ROUND_SIZE = 10;

	// ── View ──
	let view = $state<'home' | 'task' | 'summary'>('home');
	let mode = $state<'reviews' | 'practice'>('practice');

	// ── Reviews ──
	let reviewedIds = $state(new Set<string>());
	let reviews = $state(untrack(() => data.plan.mandatoryReviews));
	let reviewIndex = $state(0);
	let currentReview = $derived(reviews[reviewIndex] ?? null);
	let reviewsPending = $derived(reviews.length > 0);
	// Whole backlog, not just this round (the server caps a round at sessionMaxReview)
	let totalDueReviews = $derived(Math.max(reviews.length, data.plan.totalDueReviews));
	// Topics stay locked while reviews are pending, unless an unlock rule is met
	let topicsLocked = $derived(reviewsPending && !data.plan.topicsUnlocked);

	// ── Practice ──
	let selectedAtom = $state<FrontierItem | null>(null);
	let masteredAtomIds = $state(new Set<string>());
	let availableItems = $derived(data.plan.frontierItems.filter((item) => !masteredAtomIds.has(item.atomId)));
	let masteryMap = $state<Record<string, number>>({});
	let roundCount = $state(0);

	// ── Session stats (reset after each summary) ──
	let stats = $state({ xp: 0, correct: 0, total: 0, bestCombo: 0, mastered: [] as string[], goalReached: false, levelUp: 0 });
	let summaryReason = $state<'reviews' | 'mastered' | 'round' | 'closed'>('round');
	let combo = $state(0);
	let levelUp = $state<{ level: number; xp: number } | null>(null);

	// ── Task + answer state ──
	let currentTask = $state<TaskDisplay | null>(null);
	let answer = $state('');
	let isLoading = $state(false);
	let isSubmitting = $state(false);
	let submitError = $state(false);
	// keys of recently shown tasks (prompt + sketch), most recent last — sent as `ex` to avoid repeats
	let recentKeys: string[] = [];

	// ── Greeting (client time) ──
	let greet = $state('Hallo');
	onMount(() => {
		greet = greeting();
		coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
		return () => {
			ui.focusMode = false;
		};
	});
	$effect(() => {
		ui.focusMode = view !== 'home';
	});

	// ── Input refs for auto-focus ──
	let answerInput = $state<HTMLInputElement | null>(null);
	let fractionInput = $state<{ focus: () => void } | null>(null);
	let fractionPartInput = $state<{ focus: () => void } | null>(null);
	let mixedPartInput = $state<{ focus: () => void } | null>(null);
	let writtenCalcInput = $state<{ focus: () => void } | null>(null);
	let numberLineInput = $state<{ focus: () => void } | null>(null);
	let zahlenmauernInput = $state<{ focus: () => void } | null>(null);

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

	const isZahlenmauer = $derived(currentTask?.inputData?.type === 'zahlenmauer');
	const isFractionPart = $derived(currentTask?.inputData?.type === 'fraction_part');
	const isMixedPart = $derived(currentTask?.inputData?.type === 'mixed_part');
	const isPqSteps = $derived(currentTask?.inputData?.type === 'pq_steps');

	// pq multi-step state
	let pqStepIndex = $state(0);
	let pqStepHintVisible = $state(false);

	type PqSubStep = { subPrompt: string; choices: string[]; correctAnswer: string; hint: string; context?: string; isFinal?: boolean };
	const pqCurrentStep = $derived(
		isPqSteps ? ((currentTask!.inputData!.subSteps as PqSubStep[])[pqStepIndex] ?? null) : null
	);

	function selectPqStep(value: string) {
		if (!pqCurrentStep) return;
		if (value === pqCurrentStep.correctAnswer) {
			if (pqCurrentStep.isFinal) {
				answer = value;
				submitAnswer();
			} else {
				pqStepIndex++;
				pqStepHintVisible = false;
			}
		} else {
			pqStepHintVisible = true;
		}
	}

	$effect(() => {
		if (view === 'task' && currentTask && !showFeedback) {
			// Set inputmode="none" before focusing, so no system keyboard flashes up
			if (showPad && coarsePointer && cardEl) setPadMode(cardEl, true);
			if (isFractionPart) {
				fractionPartInput?.focus();
			} else if (isMixedPart) {
				mixedPartInput?.focus();
			} else if (currentTask.answerType === 'fraction') {
				fractionInput?.focus();
			} else if (writtenArith) {
				writtenCalcInput?.focus();
			} else if (isNumberLine) {
				numberLineInput?.focus();
			} else if (isZahlenmauer) {
				zahlenmauernInput?.focus();
			} else if (!currentTask.choices && currentTask.answerType !== 'boolean' && currentTask.answerType !== 'comparison' && !isPqSteps) {
				answerInput?.focus();
			}
			// The docked number pad covers the bottom of the screen – scroll the field above it
			if (showPad) requestAnimationFrame(() => revealAboveDock(document.activeElement));
		}
	});

	// ── Explanation state ──
	let showExplanationManual = $state(false);
	let hadWrongAttempt = $state(false);

	// ── Feedback state ──
	let showFeedback = $state(false);
	let lastResult = $state<AttemptResult | null>(null);
	let masteryBefore = $state<number | null>(null);
	let autoAdvanceTimer = $state<ReturnType<typeof setTimeout> | null>(null);

	let locked = $derived(isSubmitting || showFeedback);

	// ── "Warum?" – short rationale for the task just answered ──
	// Sources, most specific first: the task's own `why` text, its worked steps, the hint
	// (wrong answers only) and finally the general explanation of the topic.
	let showWhy = $state(false);
	let showTopic = $state(false);
	const whySteps = $derived(
		Array.isArray(currentTask?.inputData?.steps) ? (currentTask!.inputData!.steps as unknown[]).map(String) : null
	);
	const whyText = $derived(lastResult?.why ?? (whySteps ? null : (lastResult?.hint ?? null)));
	const hasTaskWhy = $derived(!!whyText || !!whySteps);

	function openWhy() {
		clearAutoAdvance();
		showWhy = true;
	}

	// ── On-screen number pad ──
	// The on-screen pad is always used – the device keyboard is never offered
	const padPreferred = true;
	let coarsePointer = $state(false);
	let cardEl = $state<HTMLElement | null>(null);
	let lastFocusedInput: HTMLInputElement | null = null;
	const padEligible = $derived(
		!!currentTask &&
		!currentTask.choices &&
		currentTask.answerType !== 'boolean' &&
		currentTask.answerType !== 'comparison' &&
		currentTask.answerType !== 'text' &&
		!isPqSteps &&
		!isNumberLine &&
		!writtenArith // has its own digit pad
	);
	// ── Step-by-step mode for linear equations ──
	const stepEq = $derived(
		currentTask && !currentTask.choices && ['integer', 'number', 'fraction'].includes(currentTask.answerType) &&
		!isFractionPart && !isMixedPart && !isNumberLine && !writtenArith && !isZahlenmauer && !isPqSteps
			? findStepEquation(currentTask.prompt)
			: null
	);
	/** Task the step mode was opened for – switching tasks closes it automatically. */
	let stepTaskId = $state<string | null>(null);
	const stepMode = $derived(!!stepEq && !!currentTask && stepTaskId === currentTask.taskId);
	const showPad = $derived(padEligible && padPreferred && !showFeedback && !stepMode);
	/** Plain single answer field (not fraction / Zahlenmauer / written calculation) */
	const simpleNumberField = $derived(
		!!currentTask && (currentTask.answerType === 'integer' || currentTask.answerType === 'number') &&
		!isFractionPart && !isMixedPart && !writtenArith && !isZahlenmauer
	);

	let padDockEl = $state<HTMLElement | null>(null);

	/** Scroll the nearest scroll container so `el` sits fully visible above the docked number pad. */
	function revealAboveDock(el: Element | null) {
		if (!(el instanceof HTMLElement) || !padDockEl) return;
		const scroller = scrollerOf(el);
		if (!scroller) return;
		const margin = 16;
		const r = el.getBoundingClientRect();
		const visibleTop = scroller.getBoundingClientRect().top + margin;
		const visibleBottom = padDockEl.getBoundingClientRect().top - margin;
		if (r.bottom > visibleBottom) {
			// prefer showing the whole field; never push its top out of view
			scroller.scrollBy({ top: Math.min(r.bottom - visibleBottom, r.top - visibleTop), behavior: 'smooth' });
		} else if (r.top < visibleTop) {
			scroller.scrollBy({ top: r.top - visibleTop, behavior: 'smooth' });
		}
	}

	function scrollerOf(el: Element | null): HTMLElement | null {
		let node = el?.parentElement ?? null;
		while (node && !/(auto|scroll)/.test(getComputedStyle(node).overflowY)) node = node.parentElement;
		return node;
	}

	// ── "More below" hint: blinking arrow while task content is hidden under the pad / footer ──
	let moreBelow = $state(false);
	$effect(() => {
		const card = cardEl;
		if (!card || view !== 'task' || showFeedback) {
			moreBelow = false;
			return;
		}
		const scroller = scrollerOf(card);
		if (!scroller) return;
		const update = () => {
			// covered by the docked pad / sticky footer, or simply below the fold
			const cover = padDockEl?.getBoundingClientRect().top ?? scroller.getBoundingClientRect().bottom;
			// bottom of the actual content (ignore the card's own padding)
			let contentBottom = -Infinity;
			for (const child of card.children) contentBottom = Math.max(contentBottom, child.getBoundingClientRect().bottom);
			moreBelow = contentBottom - cover > 12;
		};
		update();
		scroller.addEventListener('scroll', update, { passive: true });
		const ro = new ResizeObserver(update);
		ro.observe(card);
		ro.observe(scroller);
		if (padDockEl) ro.observe(padDockEl);
		return () => {
			scroller.removeEventListener('scroll', update);
			ro.disconnect();
		};
	});

	function scrollDown() {
		const scroller = scrollerOf(cardEl);
		scroller?.scrollBy({ top: scroller.clientHeight * 0.6, behavior: 'smooth' });
	}

	function onPad(key: PadKey) {
		if (!cardEl || locked) return;
		pressKey(cardEl, key, lastFocusedInput);
		if (lastFocusedInput) revealAboveDock(lastFocusedInput);
	}

	function trackFocus(e: FocusEvent) {
		if (e.target instanceof HTMLInputElement) {
			lastFocusedInput = e.target;
			if (showPad) revealAboveDock(e.target);
		}
	}

	// ── Derived display values ──
	let activeItem = $derived(mode === 'reviews' ? currentReview : selectedAtom);
	let progressPct = $derived(
		mode === 'reviews'
			? Math.round(((reviewIndex + (showFeedback ? 1 : 0)) / Math.max(1, reviews.length)) * 100)
			: Math.round((roundCount / ROUND_SIZE) * 100)
	);
	let progressLabel = $derived(
		mode === 'reviews'
			? `Wiederholung ${Math.min(reviewIndex + 1, reviews.length)} von ${reviews.length}`
			: `Aufgabe ${Math.min(roundCount + 1, ROUND_SIZE)} von ${ROUND_SIZE}`
	);
	let goalPct = $derived(Math.min(1, data.dailyXp / Math.max(1, data.dailyGoal)));
	let goalRemaining = $derived(Math.max(0, data.dailyGoal - data.dailyXp));
	let level = $derived(levelProgress(data.xp, data.level));

	const RING_C = 2 * Math.PI * 38;

	const MASCOT_TIPS = [
		'Du schaffst das!',
		'Lies die Aufgabe ganz in Ruhe.',
		'Genauigkeit schlägt Tempo.',
		'Feststecken ist okay – dafür gibt es Tipps.',
		'Jeder Fehler bringt dich weiter.',
		'Schritt für Schritt – wie ein Profi.'
	];
	let tipIndex = $state(0);

	const CORRECT_TITLES = ['Richtig!', 'Stark, richtig!', 'Super!', 'Genau so!', 'Klasse!'];
	let correctTitle = $state(CORRECT_TITLES[0]);

	// ── Navigation between views ──
	function resetStats() {
		stats = { xp: 0, correct: 0, total: 0, bestCombo: 0, mastered: [], goalReached: false, levelUp: 0 };
	}

	function startReviews() {
		mode = 'reviews';
		reviewIndex = 0;
		view = 'task';
		loadTask(reviews[0].atomId);
	}

	function selectAtom(item: FrontierItem) {
		mode = 'practice';
		selectedAtom = item;
		roundCount = 0;
		if (masteryMap[item.atomId] === undefined) masteryMap[item.atomId] = item.mastery;
		view = 'task';
		loadTask(item.atomId, item.type === 'discrimination');
	}

	function showSummary(reason: typeof summaryReason) {
		clearAutoAdvance();
		summaryReason = reason;
		showFeedback = false;
		currentTask = null;
		view = 'summary';
	}

	function closeTask() {
		if (stats.total > 0) {
			showSummary('closed');
		} else {
			goHome();
		}
	}

	async function goHome() {
		clearAutoAdvance();
		view = 'home';
		currentTask = null;
		showFeedback = false;
		selectedAtom = null;
		mode = 'practice';
		resetStats();
		await invalidate('app:practice');
		// Re-read due reviews, but never ask again for those done in this visit
		reviews = data.plan.mandatoryReviews.filter((r) => !reviewedIds.has(r.atomId));
		reviewIndex = 0;
	}

	function continueAfterSummary() {
		resetStats();
		if (summaryReason === 'reviews' || summaryReason === 'mastered' || !selectedAtom) {
			goHome();
			return;
		}
		roundCount = 0;
		view = 'task';
		loadTask(selectedAtom.atomId, selectedAtom.type === 'discrimination');
	}

	async function loadTask(atomId: string, isDiscrimination = false) {
		isLoading = true;
		currentTask = null;
		answer = '';
		showFeedback = false;
		lastResult = null;
		submitError = false;
		showExplanationManual = false;
		hadWrongAttempt = false;
		showWhy = false;
		showTopic = false;
		pqStepIndex = 0;
		pqStepHintVisible = false;
		tipIndex = (tipIndex + 1) % MASCOT_TIPS.length;
		try {
			const params = new URLSearchParams();
			recentKeys.slice(-5).forEach((k) => params.append('ex', k));
			const qs = params.toString();
			const base = isDiscrimination ? `/api/task/cluster/${atomId}` : `/api/task/${atomId}`;
			const res = await fetch(`${base}${qs ? '?' + qs : ''}`);
			if (!res.ok) throw new Error();
			const task = await res.json();
			currentTask = task;
			recentKeys = [...recentKeys, task.key ?? task.prompt].slice(-10);
		} catch {
			// null task → error state
		} finally {
			isLoading = false;
		}
	}

	async function submitAnswer() {
		if (!currentTask || isSubmitting || showFeedback || !String(answer).trim()) return;
		// Always the atomId the task actually came from — for discrimination sets
		// selectedAtom.atomId is the cluster id, not the resolved sub-atom.
		const atomId = currentTask.atomId;
		isSubmitting = true;
		submitError = false;
		try {
			const res = await fetch('/api/attempt', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ taskId: currentTask.taskId, atomId, answer: String(answer).trim(), isReview: mode === 'reviews' })
			});
			if (!res.ok) throw new Error();
			const result: AttemptResult = await res.json();
			masteryBefore = mode === 'practice' && selectedAtom?.type !== 'discrimination' ? (masteryMap[atomId] ?? null) : null;
			if (mode === 'practice') masteryMap[atomId] = result.mastery;
			lastResult = result;
			// After a mistake the rationale is shown right away; after a correct answer it waits behind the button.
			showWhy = !result.correct;
			showTopic = false;
			showFeedback = true;
			correctTitle = result.combo >= 3 ? 'Stark, richtig!' : CORRECT_TITLES[Math.floor(Math.random() * CORRECT_TITLES.length)];
			if (!result.correct) hadWrongAttempt = true;

			// session stats
			combo = result.combo;
			stats.total += 1;
			stats.xp += result.xpGained;
			if (result.correct) stats.correct += 1;
			stats.bestCombo = Math.max(stats.bestCombo, result.combo);
			if (result.justMastered) stats.mastered = [...stats.mastered, labelFor(atomId)];
			if (result.dailyGoalReached) stats.goalReached = true;
			if (result.levelUp) {
				stats.levelUp = result.newLevel;
				levelUp = { level: result.newLevel, xp: result.newXp };
			}
			if (mode === 'practice') roundCount += 1;

			invalidate('app:gami');
			invalidate('app:progress');
			if (result.justMastered) invalidate('app:practice');

			const special = result.justMastered || result.levelUp || result.newBadges.length > 0 || result.dailyGoalReached || result.freezeUsed || result.freezeEarned;
			if (result.correct && !special) {
				// A little longer when there is a "Warum?" to tap – tapping it stops the timer.
				const canAskWhy = !!result.why || Array.isArray(currentTask.inputData?.steps) || !!currentTask.explanation;
				autoAdvanceTimer = setTimeout(() => {
					autoAdvanceTimer = null;
					handleContinue();
				}, canAskWhy ? 2000 : 1300);
			}
		} catch {
			submitError = true;
		} finally {
			isSubmitting = false;
		}
	}

	function labelFor(atomId: string): string {
		if (selectedAtom && selectedAtom.atomId === atomId) return selectedAtom.label;
		return data.plan.frontierItems.find((f) => f.atomId === atomId)?.label ?? currentReview?.label ?? 'Neues Thema';
	}

	function clearAutoAdvance() {
		if (autoAdvanceTimer !== null) {
			clearTimeout(autoAdvanceTimer);
			autoAdvanceTimer = null;
		}
	}

	function handleContinue() {
		clearAutoAdvance();
		if (mode === 'reviews') {
			if (currentReview) reviewedIds = new Set([...reviewedIds, currentReview.atomId]);
			const next = reviewIndex + 1;
			if (next >= reviews.length) {
				reviews = [];
				reviewIndex = 0;
				showSummary('reviews');
				// Refresh backlog + unlock state for the summary text
				invalidate('app:practice');
			} else {
				reviewIndex = next;
				loadTask(reviews[next].atomId);
			}
			return;
		}
		if (lastResult?.justMastered && selectedAtom?.type !== 'discrimination') {
			masteredAtomIds = new Set([...masteredAtomIds, selectedAtom!.atomId]);
			showSummary('mastered');
			return;
		}
		if (roundCount >= ROUND_SIZE) {
			showSummary('round');
			return;
		}
		// Mixed practice never "completes" — keep drawing from the same cluster.
		loadTask(selectedAtom!.atomId, selectedAtom!.type === 'discrimination');
	}

	function selectAnswer(value: string) {
		answer = value;
		submitAnswer();
	}

	function toggleSign() {
		const s = String(answer);
		answer = s.startsWith('-') ? s.slice(1) : '-' + s;
		answerInput?.focus();
	}

	function handleKeydown(e: KeyboardEvent) {
		// Already handled by an input component (e.g. fraction numerator → denominator)
		if (view !== 'task' || e.key !== 'Enter' || e.defaultPrevented) return;
		if (showFeedback && !isSubmitting) {
			e.preventDefault();
			handleContinue();
		} else if (String(answer).trim() && !isSubmitting) {
			submitAnswer();
		}
	}

	function badgeIcon(type: string): 'star' | 'flame' | 'bolt' | 'sparkle' {
		const cat = BADGE_BY_TYPE[type]?.category;
		return cat === 'atoms' ? 'star' : cat === 'streak' ? 'flame' : cat === 'xp' ? 'bolt' : 'sparkle';
	}

	function summaryTitle(): string {
		if (summaryReason === 'reviews') return 'Wiederholung geschafft!';
		if (summaryReason === 'mastered') return 'Neuer Stern!';
		if (summaryReason === 'closed') return 'Gut gemacht!';
		return 'Runde geschafft!';
	}

	function reviewWord(n: number): string {
		return n === 1 ? 'Wiederholung' : 'Wiederholungen';
	}

	function summarySubtitle(): string {
		if (summaryReason === 'reviews') {
			const left = data.plan.totalDueReviews;
			if (left === 0) return 'Jetzt bist du bereit für Neues.';
			if (data.plan.topicsUnlocked) return `Die Themen sind frei! ${left} ${reviewWord(left)} kannst du freiwillig noch machen.`;
			const n = data.plan.reviewsUntilUnlock;
			return `Noch ${n} ${reviewWord(n)}, dann sind die Themen frei.`;
		}
		if (stats.goalReached || data.dailyXp >= data.dailyGoal) return 'Du hast heute dein Tagesziel erreicht.';
		const left = Math.max(0, data.dailyGoal - data.dailyXp);
		return `Noch ${left} XP bis zu deinem Tagesziel.`;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="practice-page">

{#if view === 'home'}
	<!-- ═══════════════ HOME ═══════════════ -->
	<div class="home">
		<header class="home-header">
			<div class="hello">
				<span class="hello-small">{greet}</span>
				<h1 class="hello-name">{data.studentName}!</h1>
			</div>
			<div class="chips">
				<span class="chip chip-streak" title="Tage am Stück geübt">
					<Icon name="flame" size={18} color="var(--c-orange)" />
					{data.streakDays}<span class="sr-only"> Tage Streak</span>
				</span>
				<a href="/badges" class="chip chip-level">
					<Icon name="star" size={18} color="var(--c-primary)" />
					Lv {data.level}
				</a>
			</div>
		</header>

		<section class="goal-card" aria-label="Tagesziel">
			<svg class="goal-ring" width="92" height="92" viewBox="0 0 92 92" role="img" aria-label="Tagesziel zu {Math.round(goalPct * 100)} Prozent erreicht">
				<circle cx="46" cy="46" r="38" fill="none" stroke="var(--c-navy-3)" stroke-width="10" />
				<circle
					cx="46" cy="46" r="38" fill="none"
					stroke={goalPct >= 1 ? 'var(--c-star)' : 'var(--c-sky)'}
					stroke-width="10" stroke-linecap="round"
					stroke-dasharray="{goalPct * RING_C} {RING_C}"
					transform="rotate(-90 46 46)"
					class="goal-arc"
				/>
				{#if goalPct >= 1}
					<path d="m33 47 9 9 17-19" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
				{:else}
					<text x="46" y="45" text-anchor="middle" font-size="22" font-weight="900" fill="#fff">{data.dailyXp}</text>
					<text x="46" y="62" text-anchor="middle" font-size="12" font-weight="800" fill="#bfdbfe">von {data.dailyGoal} XP</text>
				{/if}
			</svg>
			<div class="goal-text">
				<span class="eyebrow">Tagesziel</span>
				{#if goalPct >= 1}
					<strong>Tagesziel geschafft!</strong>
					<span class="goal-sub">Alles ab jetzt ist Bonus für dein Level.</span>
				{:else if data.dailyXp === 0}
					<strong>Sammle heute {data.dailyGoal} XP</strong>
					<span class="goal-sub">Schon ein paar Aufgaben reichen.</span>
				{:else}
					<strong>Nur noch {goalRemaining} XP bis zum Ziel!</strong>
					<span class="goal-sub">Du bist auf einem super Weg.</span>
				{/if}
			</div>
		</section>

		<section class="card week-card" aria-label="Diese Woche">
			<div class="week-top">
				<h2 class="card-title">Diese Woche</h2>
				<span class="freeze" title="Ein Streak-Schutz rettet deine Serie, wenn du einen Tag verpasst.">
					<Icon name="shield" size={14} color="var(--c-primary)" />
					Streak-Schutz: {data.streakFreezes}
				</span>
			</div>
			<ol class="week">
				{#each data.week as day}
					<li class="day" class:active={day.active} class:today={day.isToday} class:future={day.isFuture}>
						<span class="day-dot">
							{#if day.active}
								<Icon name="check" size={16} color="#fff" />
							{:else if day.isToday}
								heute
							{/if}
						</span>
						<span class="day-label">{day.label}</span>
						<span class="sr-only">{day.active ? 'geübt' : 'nicht geübt'}</span>
					</li>
				{/each}
			</ol>
			{#if data.streakFrozen && !data.practicedToday && data.streakDays > 0}
				<div class="frozen-note">
					<span class="frozen-ato"><Ato mood="schlaf" size="100%" /></span>
					<p>
						<strong>Ato hält deine Serie warm.</strong>
						Dein Streak-Schutz rettet deine {data.streakDays}-Tage-Serie – übe heute, damit sie weiterläuft.
					</p>
				</div>
			{:else if data.streakAtRisk && !data.practicedToday && data.streakDays > 0}
				<p class="risk">Übe heute, damit deine {data.streakDays}-Tage-Serie weiterläuft!</p>
			{/if}
		</section>

		{#if reviewsPending}
			<section class="review-card" aria-label="Wiederholen">
				<span class="review-mascot"><Ato mood="denkt" size="100%" /></span>
				<div class="review-text">
					<strong>{totalDueReviews} {reviewWord(totalDueReviews)} fällig</strong>
					{#if totalDueReviews > reviews.length}
						<span>Nächste Runde: {reviews.length} · ca. {Math.max(1, Math.round(reviews.length * 0.7))} Min.</span>
					{:else}
						<span>Damit du nichts vergisst · ca. {Math.max(1, Math.round(reviews.length * 0.7))} Min.</span>
					{/if}
					{#if data.plan.reviewsDoneToday > 0}
						<span>Heute schon {data.plan.reviewsDoneToday} geschafft</span>
					{/if}
				</div>
				<button class="play-btn" onclick={startReviews} aria-label="Wiederholungen starten">
					<Icon name="play" size={22} color="#fff" />
				</button>
			</section>
		{/if}

		<section class="topics" aria-label="Themen">
			<div class="section-head">
				<h2 class="section-title">{topicsLocked ? 'Danach geht’s weiter mit' : 'Bereit für Neues'}</h2>
			</div>

			{#if availableItems.length === 0 && data.plan.discriminationSets.length === 0}
				<div class="empty-state">
					<span class="empty-mascot"><Ato mood="jubel" size="100%" /></span>
					<h3>Super gemacht!</h3>
					<p>Alle verfügbaren Themen sind gemeistert. Schau dir deine Sternenkarte an!</p>
					<a href="/progress" class="btn-3d">Zur Sternenkarte</a>
				</div>
			{:else}
				{#if topicsLocked}
					<p class="locked-note">
						<Icon name="lock" size={16} />
						{#if data.plan.reviewsUntilUnlock < totalDueReviews}
							Noch {data.plan.reviewsUntilUnlock} {reviewWord(data.plan.reviewsUntilUnlock)}, dann sind die Themen frei.
						{:else}
							Erst die Wiederholungen, dann sind die Themen frei.
						{/if}
					</p>
				{:else if reviewsPending}
					<p class="section-sub">Die Themen sind frei. Die übrigen Wiederholungen kannst du freiwillig machen.</p>
				{/if}
				<div class="topic-grid">
					{#each availableItems as item, i}
						<button class="topic-card" class:recommended={i === 0 && !topicsLocked} disabled={topicsLocked} onclick={() => selectAtom(item)}>
							{#if i === 0}
								<span class="tag">Empfohlen</span>
							{:else if item.type === 'active'}
								<span class="tag">Weiterüben</span>
							{:else}
								<span class="tag tag-new">Neu</span>
							{/if}
							<span class="topic-label">{item.label}</span>
							<span class="bar"><span style="width: {Math.round((masteryMap[item.atomId] ?? item.mastery) * 100)}%"></span></span>
							<span class="topic-meta">
								{(masteryMap[item.atomId] ?? item.mastery) > 0 ? `${Math.round((masteryMap[item.atomId] ?? item.mastery) * 100)} % gemeistert` : 'Noch nicht begonnen'}
							</span>
						</button>
					{/each}
				</div>

				{#if data.plan.discriminationSets.length > 0}
					<div class="section-head mixed-head">
						<h2 class="section-title">Vermischtes Üben</h2>
					</div>
					<p class="section-sub">Du kannst diese Themen einzeln – jetzt gemischt!</p>
					<div class="topic-grid">
						{#each data.plan.discriminationSets as item}
							<button class="topic-card mixed" disabled={topicsLocked} onclick={() => selectAtom(item)}>
								<span class="tag tag-mixed">Vermischt</span>
								<span class="topic-label">{item.label}</span>
								<span class="topic-meta"><Icon name="shuffle" size={14} /> Bunt gemischt</span>
							</button>
						{/each}
					</div>
				{/if}
			{/if}
		</section>
	</div>

{:else if view === 'summary'}
	<!-- ═══════════════ SUMMARY ═══════════════ -->
	<div class="summary">
		<svg class="confetti" viewBox="0 0 390 320" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
			<g fill="#7dd3fc">
				<circle cx="40" cy="60" r="2.5" /><circle cx="90" cy="130" r="1.5" /><circle cx="340" cy="40" r="2" />
				<circle cx="360" cy="170" r="2.5" /><circle cx="300" cy="100" r="1.5" /><circle cx="30" cy="220" r="1.5" />
			</g>
			<g stroke-linecap="round" stroke-width="5">
				<path d="M70 80 l12 -14" stroke="#f59e0b" /><path d="M320 70 l-6 -16" stroke="#38bdf8" />
				<path d="M330 210 l16 -4" stroke="#f97316" /><path d="M50 180 l-14 -6" stroke="#34d399" />
			</g>
		</svg>
		<div class="summary-inner">
			<div class="summary-hero">
				<span class="summary-mascot"><Ato mood="jubel" size="100%" label="Ato freut sich mit dir" /></span>
				<h1>{summaryTitle()}</h1>
				<p>{summarySubtitle()}</p>
			</div>

			<div class="stat-tiles">
				<div class="stat-tile gold">
					<Icon name="star" size={24} color="var(--c-gold)" />
					<strong>+{stats.xp}</strong>
					<span>XP verdient</span>
				</div>
				<div class="stat-tile green">
					<Icon name="target" size={24} color="var(--c-success)" />
					<strong>{stats.correct} / {stats.total}</strong>
					<span>richtig</span>
				</div>
				<div class="stat-tile orange">
					<Icon name="flame" size={24} color="var(--c-orange)" />
					<strong>{data.streakDays}</strong>
					<span>{data.streakDays === 1 ? 'Tag' : 'Tage'} Streak</span>
				</div>
			</div>

			{#each stats.mastered as label}
				<div class="new-star">
					<span class="new-star-icon"><Icon name="sparkle" size={28} color="var(--c-star)" /></span>
					<div>
						<span class="eyebrow star">Neuer Stern</span>
						<strong>{label} gemeistert</strong>
						<span class="new-star-sub">Er leuchtet jetzt auf deiner Sternenkarte.</span>
					</div>
				</div>
			{/each}

			{#if stats.bestCombo >= 3}
				<p class="summary-note"><Icon name="bolt" size={18} color="var(--c-orange)" /> Beste Combo: {stats.bestCombo} richtige Antworten in Folge</p>
			{/if}
			{#if stats.levelUp}
				<p class="summary-note"><Icon name="star" size={18} color="var(--c-star)" /> Level {stats.levelUp} erreicht!</p>
			{/if}

			<div class="summary-level">
				<div class="summary-level-top">
					<span>Level {data.level}</span>
					<span>{level.nextLevelXp ? `noch ${level.remaining} XP bis Level ${data.level + 1}` : 'Höchstes Level!'}</span>
				</div>
				<div class="summary-level-track" role="progressbar" aria-label="Fortschritt zum nächsten Level" aria-valuemin="0" aria-valuemax="100" aria-valuenow={level.pct}>
					<span style="width: {level.pct}%"></span>
				</div>
			</div>

			<div class="summary-actions">
				<button class="btn-3d sky" onclick={continueAfterSummary}>
					{summaryReason === 'round' || summaryReason === 'closed' ? (selectedAtom ? 'Weiter üben' : 'Zur Übersicht') : summaryReason === 'reviews' ? 'Neues Thema wählen' : 'Nächstes Thema'}
				</button>
				<button class="summary-home" onclick={goHome}>Zur Startseite</button>
			</div>
		</div>
	</div>

{:else}
	<!-- ═══════════════ TASK ═══════════════ -->
	<div class="task-view">
		<header class="task-header">
			<button class="icon-btn" onclick={closeTask} aria-label="Sitzung beenden">
				<Icon name="close" size={24} />
			</button>
			<div class="task-progress" role="progressbar" aria-label={progressLabel} aria-valuemin="0" aria-valuemax="100" aria-valuenow={progressPct}>
				<span style="width: {Math.max(4, progressPct)}%"></span>
			</div>
			<span class="chip chip-combo" class:hot={combo >= 3} class:off={combo < 2} aria-label="Combo: {combo} richtig in Folge">
				<Icon name="bolt" size={16} color={combo >= 3 ? '#fff' : 'var(--c-orange)'} />
				{combo}×
			</span>
		</header>

		<div class="task-meta">
			<span class="tag" class:tag-new={mode === 'practice' && activeItem?.type === 'new'} class:tag-mixed={activeItem?.type === 'discrimination'}>
				{mode === 'reviews' ? 'Wiederholung' : activeItem?.type === 'discrimination' ? 'Vermischt' : activeItem?.type === 'new' ? 'Neues Thema' : 'Weiterüben'}
			</span>
			<span class="task-atom">{activeItem?.label}</span>
		</div>

		<div class="task-area">
			{#if isLoading}
				<div class="task-loading">
					<div class="spinner"></div>
					<span>Aufgabe wird geladen…</span>
				</div>
			{:else if !currentTask}
				<div class="task-error">
					<p>Die Aufgabe konnte nicht geladen werden.</p>
					<button class="btn-3d" onclick={() => activeItem && loadTask(activeItem.atomId, activeItem.type === 'discrimination')}>
						Nochmal versuchen
					</button>
				</div>
			{:else}
				<div class="task-card" class:dimmed={showFeedback} bind:this={cardEl} onfocusin={trackFocus} use:numpadInputs={showPad && coarsePointer}>
					{#if (showExplanationManual || hadWrongAttempt) && currentTask.explanation && !showFeedback}
						<AtomExplanation text={currentTask.explanation} illustrationConfig={currentTask.illustrationConfig} />
					{/if}
					{#if currentTask.svg}
						<div class="task-svg">{@html currentTask.svg}</div>
					{/if}
					<MathText text={currentTask.prompt} class="task-prompt" />
					{#if currentTask.inputData?.sublabel}
						<div class="task-sublabel">{currentTask.inputData.sublabel as string}</div>
					{/if}

					<div class="answer-area">
						{#if stepMode && stepEq}
							{#key currentTask.taskId}
								<EquationSteps
									equation={stepEq.eq}
									tex={stepEq.tex}
									answerType={currentTask.answerType}
									disabled={locked}
									onanswer={(v) => { answer = v; submitAnswer(); }}
									onclose={() => (stepTaskId = null)}
								/>
							{/key}
						{:else if isPqSteps && pqCurrentStep}
							<div class="pq-steps">
								<div class="pq-progress">Schritt {pqStepIndex + 1} / {(currentTask.inputData!.subSteps as PqSubStep[]).length}</div>
								{#if pqCurrentStep.context}
									<div class="pq-context"><MathText text={pqCurrentStep.context} /></div>
								{/if}
								<div class="pq-subprompt"><MathText text={pqCurrentStep.subPrompt} /></div>
								<div class="choice-buttons choice-buttons-multi">
									{#each pqCurrentStep.choices as choice}
										<button class="choice-btn" onclick={() => selectPqStep(choice)} disabled={locked}><MathText text={choice} /></button>
									{/each}
								</div>
								{#if pqStepHintVisible}
									<div class="hint-box">💡 <MathText text={pqCurrentStep.hint} /></div>
								{/if}
							</div>
						{:else if currentTask.choices}
							<div class="choice-buttons choice-buttons-multi">
								{#each currentTask.choices as choice}
									<button class="choice-btn" onclick={() => selectAnswer(choice)} disabled={locked}><MathText text={choice} /></button>
								{/each}
							</div>
						{:else if isFractionPart}
							{@const d = currentTask.inputData as { type: string; missing: 'numerator' | 'denominator'; knownNum?: number; knownDen?: number }}
							<FractionPartInput
								bind:this={fractionPartInput}
								bind:value={answer}
								missingPart={d.missing}
								knownNumerator={d.knownNum}
								knownDenominator={d.knownDen}
								emitFullFraction={currentTask.answerType === 'fraction'}
								disabled={locked}
								onsubmit={submitAnswer}
							/>
						{:else if isMixedPart}
							{@const d = currentTask.inputData as { type: string; missing: 'whole' | 'numerator'; whole?: number; numerator?: number; denominator: number }}
							<MixedNumberPartInput
								bind:this={mixedPartInput}
								bind:value={answer}
								missingPart={d.missing}
								whole={d.whole}
								numerator={d.numerator}
								denominator={d.denominator}
								emitFullFraction={currentTask.answerType === 'fraction'}
								disabled={locked}
								onsubmit={submitAnswer}
							/>
						{:else if currentTask.answerType === 'fraction'}
							<FractionInput bind:this={fractionInput} bind:value={answer} disabled={locked} numDigits={currentTask.inputData?.numDigits as number | undefined} onsubmit={submitAnswer} />
						{:else if writtenArith}
							{#key currentTask.taskId}
								<WrittenCalcInput bind:this={writtenCalcInput} a={writtenArith.a} b={writtenArith.b} op={writtenArith.op} bind:value={answer} disabled={locked} onsubmit={submitAnswer} />
							{/key}
						{:else if isZahlenmauer}
							{#key currentTask.taskId}
								<ZahlenmauernInput
									bind:this={zahlenmauernInput}
									top={currentTask.inputData!.top as number}
									ab={currentTask.inputData!.ab as number}
									bc={currentTask.inputData!.bc as number}
									a={currentTask.inputData!.a as number}
									b={currentTask.inputData!.b as number}
									c={currentTask.inputData!.c as number}
									missing={currentTask.inputData!.missing as 'a' | 'b' | 'c'}
									bind:value={answer}
									disabled={locked}
									onsubmit={submitAnswer}
								/>
							{/key}
						{:else if isNumberLine}
							<NumberLineInput bind:this={numberLineInput} totalSections={currentTask.inputData!.totalSections as number} bind:value={answer} disabled={locked} onsubmit={submitAnswer} />
						{:else if currentTask.answerType === 'boolean'}
							<div class="choice-buttons">
								<button class="choice-btn choice-btn-nein" onclick={() => selectAnswer('nein')} disabled={locked}>✗ Nein</button>
								<button class="choice-btn choice-btn-ja" onclick={() => selectAnswer('ja')} disabled={locked}>✓ Ja</button>
							</div>
						{:else if currentTask.answerType === 'comparison'}
							<div class="choice-buttons">
								<button class="choice-btn choice-btn-symbol" onclick={() => selectAnswer('<')} disabled={locked}>&lt;</button>
								<button class="choice-btn choice-btn-symbol" onclick={() => selectAnswer('=')} disabled={locked}>=</button>
								<button class="choice-btn choice-btn-symbol" onclick={() => selectAnswer('>')} disabled={locked}>&gt;</button>
							</div>
						{:else if currentTask.answerType === 'integer'}
							<div class="input-with-sign">
								{#if !showPad}
									<button class="sign-btn" type="button" onclick={toggleSign} disabled={locked} tabindex="-1">+/−</button>
								{/if}
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
							</div>
						{:else if currentTask.answerType === 'number'}
							<div class="input-with-sign">
								{#if !showPad}
									<button class="sign-btn" type="button" onclick={toggleSign} disabled={locked} tabindex="-1">+/−</button>
								{/if}
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
							</div>
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

					{#if stepEq && !stepMode && !showFeedback}
						<button class="step-entry" onclick={() => (stepTaskId = currentTask!.taskId)}>
							<Icon name="pencil" size={16} /> Schritt für Schritt lösen
						</button>
					{/if}

					{#if currentTask.explanation && !showFeedback}
						<button
							class="tip-btn"
							class:active={showExplanationManual || hadWrongAttempt}
							onclick={() => (showExplanationManual = !showExplanationManual)}
							aria-expanded={showExplanationManual || hadWrongAttempt}
						>
							<Icon name="bulb" size={18} />
							{showExplanationManual || hadWrongAttempt ? 'Tipp ausblenden' : 'Tipp anzeigen'}
						</button>
					{/if}
				</div>

				{#if !showFeedback}
					<div class="mascot-tip">
						<span class="tip-ato"><Ato mood="freude" size="100%" /></span>
						<p>{MASCOT_TIPS[tipIndex]}</p>
					</div>
				{/if}

				{#if submitError}
					<p class="submit-error" role="alert">Das hat nicht geklappt. Bitte versuch es noch einmal.</p>
				{/if}

				{#if !showPad && !showFeedback && !currentTask.choices && currentTask.answerType !== 'boolean' && currentTask.answerType !== 'comparison' && !writtenArith && !isZahlenmauer && !isPqSteps && !stepMode}
					<div class="task-footer">
						{#if moreBelow}
							<button class="more-below" onclick={scrollDown} aria-label="Nach unten scrollen – da kommt noch mehr">
								<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg>
							</button>
						{/if}
						<button class="btn-3d" onclick={submitAnswer} disabled={isSubmitting || !String(answer).trim()}>
							{isSubmitting ? 'Wird geprüft…' : 'Prüfen'}
						</button>
					</div>
				{/if}
			{/if}
		</div>

		{#if showPad && currentTask && !isLoading}
			<div class="pad-dock" bind:this={padDockEl}>
				{#if moreBelow}
					<button class="more-below" onclick={scrollDown} aria-label="Nach unten scrollen – da kommt noch mehr">
						<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg>
					</button>
				{/if}
				<NumPad
					onpress={onPad}
					canSubmit={!!String(answer).trim() && !locked}
					submitting={isSubmitting}
					showMinus={simpleNumberField}
					showComma={simpleNumberField && currentTask.answerType === 'number'}
				/>
			</div>
		{/if}

		{#if showFeedback && lastResult}
			<!-- Feedback sheet -->
			<section class="sheet" class:correct={lastResult.correct} class:wrong={!lastResult.correct} aria-live="polite" aria-label="Rückmeldung">
				{#if lastResult.correct}
					<span class="sheet-mascot">
						<Ato
							mood={lastResult.combo >= 3 ? 'feuer' : lastResult.justMastered || lastResult.levelUp || lastResult.dailyGoalReached ? 'jubel' : 'freude'}
							size="100%"
						/>
					</span>
				{/if}
				<div class="sheet-body">
				<div class="sheet-head">
					<span class="sheet-icon">
						<Icon name={lastResult.correct ? 'check' : 'refresh'} size={26} color="#fff" />
					</span>
					<div>
						<h2>{lastResult.correct ? correctTitle : 'Noch nicht ganz'}</h2>
						<p>
							{#if lastResult.correct && lastResult.combo >= 2}
								{lastResult.combo} richtige Antworten in Folge
							{:else if lastResult.correct}
								Weiter so!
							{:else}
								Fehler gehören zum Lernen. Schau dir die Lösung an.
							{/if}
						</p>
					</div>
					{#if !lastResult.correct}
						<span class="sheet-ato"><Ato mood="denkt" size="100%" /></span>
					{/if}
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
									<span class="answer-label">Deine Antwort</span>
									<span class="answer-value"><MathText text={lastResult.submittedAnswer} /></span>
								</div>
							{/if}
							{#if lastResult.correctAnswer}
								<div class="answer-row answer-row-correct">
									<span class="answer-label">Richtig wäre</span>
									<span class="answer-value"><MathText text={lastResult.correctAnswer} /></span>
								</div>
							{/if}
						</div>
					{/if}
				{/if}

				{#if lastResult.correct && lastResult.xpGained > 0}
					<div class="xp-tiles">
						<div class="xp-tile">
							<Icon name="star" size={28} color="var(--c-gold)" />
							<div><strong class="gold-text">+{lastResult.xpGained - lastResult.comboBonus} XP</strong><span>für die Aufgabe</span></div>
						</div>
						{#if lastResult.comboBonus > 0}
							<div class="xp-tile">
								<Icon name="bolt" size={28} color="var(--c-orange)" />
								<div><strong class="orange-text">+{lastResult.comboBonus} XP</strong><span>Combo-Bonus</span></div>
							</div>
						{/if}
					</div>
				{/if}

				{#if lastResult.correct && masteryBefore !== null && !lastResult.justMastered}
					{@const before = Math.min(masteryBefore, lastResult.mastery)}
					<div class="mastery-box">
						<div class="mastery-top"><span>{activeItem?.label}</span><span class="green-text">{Math.round(lastResult.mastery * 100)} % gemeistert</span></div>
						<div class="bar mastery-bar">
							<span style="width: {before * 100}%; background: var(--c-success); border-radius: 0"></span>
							<span style="width: {(lastResult.mastery - before) * 100}%; background: #86efac; border-radius: 0"></span>
						</div>
					</div>
				{/if}

				{#if lastResult.justMastered}
					<div class="event event-star"><Icon name="sparkle" size={22} color="var(--c-gold)" /> Neuer Stern: {activeItem?.label} gemeistert!</div>
				{/if}
				{#if lastResult.levelUp}
					<div class="event"><Icon name="star" size={22} color="var(--c-primary)" /> Level {lastResult.newLevel} erreicht – weiter so!</div>
				{/if}
				{#if lastResult.dailyGoalReached}
					<div class="event"><Icon name="target" size={22} color="var(--c-success)" /> Tagesziel erreicht!</div>
				{/if}
				{#if lastResult.freezeUsed}
					<div class="event event-freeze"><span class="event-ato"><Ato mood="schlaf" size="100%" /></span> Dein Streak-Schutz hat deine Serie gerettet.</div>
				{/if}
				{#if lastResult.freezeEarned}
					<div class="event"><Icon name="shield" size={22} color="var(--c-primary)" /> Neuer Streak-Schutz verdient!</div>
				{/if}
				{#each lastResult.newBadges as badge}
					<div class="event">
						<Icon name={badgeIcon(badge)} size={22} color="var(--c-orange)" />
						Abzeichen „{BADGE_BY_TYPE[badge]?.name ?? badge}“: {BADGE_BY_TYPE[badge]?.desc ?? ''}
					</div>
				{/each}

				{#if hasTaskWhy || currentTask?.explanation}
					{#if !showWhy}
						<button class="why-btn" onclick={openWhy} aria-expanded="false">
							<Icon name="bulb" size={18} />
							Warum?
						</button>
					{:else}
						<div class="why-box">
							<div class="why-title"><Icon name="bulb" size={18} /> Warum?</div>
							{#if whyText}
								<p class="why-text"><MathText text={whyText} /></p>
							{/if}
							{#if whySteps}
								<div class="why-steps">
									{#each whySteps as step, i}
										<div class="step-row">
											<span class="step-num">{i + 1}.</span>
											<span class="step-text"><MathText text={step} /></span>
										</div>
									{/each}
								</div>
							{/if}
							{#if !hasTaskWhy && currentTask?.explanation}
								<AtomExplanation text={currentTask.explanation} illustrationConfig={currentTask.illustrationConfig} />
							{:else if currentTask?.explanation}
								{#if showTopic}
									<AtomExplanation text={currentTask.explanation} illustrationConfig={currentTask.illustrationConfig} />
								{:else}
									<button class="why-more" onclick={() => (showTopic = true)}>Mehr zum Thema</button>
								{/if}
							{/if}
						</div>
					{/if}
				{/if}
				</div>

				<button class="btn-3d" class:green={lastResult.correct} class:orange={!lastResult.correct} onclick={handleContinue}>
					{lastResult.correct ? 'Weiter' : 'Verstanden, weiter'}
					<Icon name="arrow" size={22} />
				</button>
			</section>
		{/if}
	</div>
{/if}
{#if levelUp}
	<LevelUpOverlay level={levelUp.level} xp={levelUp.xp} onclose={() => (levelUp = null)} />
{/if}
</div>

<style>
	.practice-page {
		min-height: 100%;
		display: flex;
		flex-direction: column;
		color: var(--c-navy);
	}

	/* ═════════ HOME ═════════ */
	.home {
		width: 100%;
		max-width: 640px;
		margin: 0 auto;
		padding: 1.25rem 1.25rem 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.home-header { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
	.hello { display: flex; flex-direction: column; min-width: 0; }
	.hello-small { font-size: 0.875rem; font-weight: 700; color: var(--c-ink-2); }
	.hello-name { font-size: 1.5rem; font-weight: 900; letter-spacing: -0.01em; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.chips { display: flex; gap: 0.5rem; flex: none; }
	a.chip { text-decoration: none; }

	.goal-card {
		background: var(--c-navy);
		color: #fff;
		border-radius: 24px;
		padding: 1.25rem;
		display: flex;
		align-items: center;
		gap: 1.1rem;
	}
	.goal-ring { flex: none; font-family: var(--font); }
	.goal-arc { transition: stroke-dasharray .8s ease; }
	.goal-text { display: flex; flex-direction: column; gap: 0.3rem; }
	.eyebrow { font-size: 0.8rem; font-weight: 800; color: #bfdbfe; text-transform: uppercase; letter-spacing: 0.06em; }
	.eyebrow.star { color: var(--c-star); }
	.goal-text strong { font-size: 1.2rem; font-weight: 900; line-height: 1.2; }
	.goal-sub { font-size: 0.875rem; font-weight: 700; color: #bfdbfe; }

	.card { background: #fff; border-radius: 20px; padding: 0.9rem 1rem; box-shadow: var(--shadow-sm); }
	.card-title { font-size: 0.95rem; font-weight: 900; }
	.week-card { display: flex; flex-direction: column; gap: 0.65rem; }
	.week-top { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
	.freeze { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8rem; font-weight: 800; color: var(--c-ink-2); }
	.week { list-style: none; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 0.35rem; }
	.day { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; }
	.day-dot {
		width: 2.15rem; height: 2.15rem; border-radius: 50%;
		background: var(--c-track);
		display: flex; align-items: center; justify-content: center;
		font-size: 0.6rem; font-weight: 900; color: var(--c-orange-text);
	}
	.day.active .day-dot { background: var(--c-orange); }
	.day.today:not(.active) .day-dot { background: #fff; border: 3px solid var(--c-orange); }
	.day.future .day-dot { background: #f5f8fc; }
	.day-label { font-size: 0.75rem; font-weight: 800; color: var(--c-ink-2); }
	.day.today .day-label { color: var(--c-orange-text); font-weight: 900; }
	.risk { font-size: 0.85rem; font-weight: 800; color: var(--c-orange-text); }
	.frozen-note { display: flex; align-items: center; gap: 0.6rem; background: var(--c-primary-light); border-radius: 14px; padding: 0.5rem 0.75rem 0.5rem 0.4rem; }
	.frozen-note p { margin: 0; font-size: 0.85rem; font-weight: 700; color: var(--c-navy); line-height: 1.35; }
	.frozen-note strong { display: block; font-weight: 900; }
	.frozen-ato { display: block; width: 56px; height: 56px; flex: none; }

	.review-card {
		background: var(--c-primary-light);
		border: 2px solid var(--c-sky-soft);
		border-radius: 20px;
		padding: 0.9rem 1rem;
		display: flex;
		align-items: center;
		gap: 0.85rem;
	}
	.review-mascot { display: block; width: 68px; height: 68px; flex: none; }
	.review-text { display: flex; flex-direction: column; gap: 0.1rem; flex: 1; min-width: 0; }
	.review-text strong { font-size: 1.05rem; font-weight: 900; }
	.review-text span { font-size: 0.875rem; font-weight: 700; color: #34507a; }
	.play-btn {
		width: 3.25rem; height: 3.25rem; flex: none;
		border: 0; border-radius: 16px;
		background: var(--c-primary); box-shadow: 0 4px 0 var(--c-primary-dark);
		display: flex; align-items: center; justify-content: center;
		animation: nudge 2.4s ease-in-out infinite;
	}
	.play-btn:active { transform: translateY(3px); box-shadow: 0 1px 0 var(--c-primary-dark); }
	@keyframes nudge { 0%, 80%, 100% { transform: scale(1); } 88% { transform: scale(1.08); } }

	.topics { display: flex; flex-direction: column; gap: 0.6rem; }
	.section-head { display: flex; justify-content: space-between; align-items: baseline; }
	.section-title { font-size: 1.15rem; font-weight: 900; }
	.section-sub { font-size: 0.875rem; font-weight: 700; color: var(--c-ink-2); margin-top: -0.35rem; }
	.mixed-head { margin-top: 0.75rem; }
	.locked-note { display: flex; align-items: center; gap: 0.4rem; font-size: 0.875rem; font-weight: 700; color: var(--c-ink-2); }
	.topic-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 0.65rem; }
	.topic-card {
		font-family: var(--font);
		text-align: left;
		background: #fff;
		color: var(--c-navy);
		border: 2px solid transparent;
		border-radius: 18px;
		padding: 0.85rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		box-shadow: var(--shadow-sm);
		cursor: pointer;
		transition: border-color .15s, transform .1s;
	}
	.topic-card.recommended { border-color: var(--c-primary); }
	.topic-card:hover:not(:disabled), .topic-card:focus-visible { border-color: var(--c-primary); outline: none; }
	.topic-card:active:not(:disabled) { transform: scale(0.98); }
	.topic-card:disabled { opacity: 0.55; cursor: not-allowed; }
	.topic-card.mixed { background: #fffaf5; }
	.topic-label { font-size: 0.95rem; font-weight: 900; line-height: 1.25; overflow-wrap: anywhere; }
	.topic-meta { display: flex; align-items: center; gap: 0.3rem; font-size: 0.75rem; font-weight: 800; color: var(--c-ink-2); margin-top: auto; }

	.empty-state { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 0.75rem; padding: 1.5rem 1rem; }
	.empty-state h3 { font-size: 1.25rem; font-weight: 900; }
	.empty-state p { color: var(--c-ink-2); font-weight: 700; }
	.empty-mascot { display: block; width: 120px; height: 120px; }

	/* ═════════ SUMMARY ═════════ */
	.summary {
		position: relative;
		flex: 1;
		min-height: 100svh;
		background: var(--c-navy);
		color: #fff;
		overflow: hidden;
	}
	.confetti { position: absolute; top: 0; left: 0; width: 100%; height: 320px; }
	.summary-inner {
		position: relative;
		max-width: 480px;
		margin: 0 auto;
		min-height: 100svh;
		padding: 1.5rem 1.25rem calc(1.25rem + env(safe-area-inset-bottom, 0px));
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
	}
	.summary-hero { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 0.25rem; }
	.summary-mascot { display: block; width: 170px; height: 170px; animation: hop .7s cubic-bezier(.3, 1.6, .5, 1) both; }
	@keyframes hop { from { transform: translateY(30px) scale(0.8); opacity: 0; } }
	.summary-hero h1 { font-size: 2rem; font-weight: 900; letter-spacing: -0.02em; }
	.summary-hero p { font-weight: 700; color: #bfdbfe; }
	.stat-tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.6rem; }
	.stat-tile {
		background: #fff; color: var(--c-navy);
		border-radius: 18px; padding: 0.75rem 0.4rem;
		display: flex; flex-direction: column; align-items: center; gap: 0.1rem;
		border-bottom: 5px solid var(--c-line);
		animation: rise .5s both;
	}
	.stat-tile:nth-child(2) { animation-delay: .08s; }
	.stat-tile:nth-child(3) { animation-delay: .16s; }
	@keyframes rise { from { transform: translateY(14px); opacity: 0; } }
	.stat-tile.gold { border-bottom-color: var(--c-gold); }
	.stat-tile.green { border-bottom-color: var(--c-success); }
	.stat-tile.orange { border-bottom-color: var(--c-orange); }
	.stat-tile strong { font-size: 1.45rem; font-weight: 900; }
	.stat-tile span { font-size: 0.75rem; font-weight: 800; color: var(--c-ink-2); }
	.new-star {
		background: var(--c-navy-2); border: 2px solid #2b5a9e; border-radius: 20px;
		padding: 0.85rem 1rem; display: flex; align-items: center; gap: 0.85rem;
	}
	.new-star > div { display: flex; flex-direction: column; gap: 0.1rem; }
	.new-star strong { font-size: 1.05rem; font-weight: 900; }
	.new-star-icon {
		width: 3.25rem; height: 3.25rem; flex: none; border-radius: 50%;
		background: var(--c-navy); border: 2px solid var(--c-star);
		display: flex; align-items: center; justify-content: center;
		box-shadow: 0 0 18px rgba(252, 211, 77, .55);
	}
	.new-star-sub { font-size: 0.8rem; font-weight: 700; color: #bfdbfe; }
	.summary-note { display: flex; align-items: center; gap: 0.45rem; font-weight: 800; color: #e0f2fe; }
	.summary-level { display: flex; flex-direction: column; gap: 0.45rem; }
	.summary-level-top { display: flex; justify-content: space-between; font-size: 0.875rem; font-weight: 800; color: #bfdbfe; }
	.summary-level-track { height: 1rem; border-radius: 999px; background: var(--c-navy-3); overflow: hidden; }
	.summary-level-track span { display: block; height: 100%; background: var(--c-sky); border-radius: 999px; transition: width .8s ease; }
	.summary-actions { margin-top: auto; display: flex; flex-direction: column; gap: 0.5rem; }
	.summary-home {
		min-height: 3rem; border: 0; background: transparent; color: #fff;
		font: 800 1.05rem var(--font); border-radius: 1rem; cursor: pointer;
	}
	.summary-home:hover { background: var(--c-navy-2); }

	/* ═════════ TASK ═════════ */
	.task-view {
		flex: 1;
		width: 100%;
		max-width: 640px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		min-height: 100%;
	}
	.task-header { display: flex; align-items: center; gap: 0.75rem; padding: 1rem 1.25rem 0.4rem; }
	.icon-btn {
		width: 2.75rem; height: 2.75rem; flex: none;
		border: 0; background: transparent; color: var(--c-ink-2);
		border-radius: 14px; display: flex; align-items: center; justify-content: center; cursor: pointer;
	}
	.icon-btn:hover { background: var(--c-track); }
	.task-progress { flex: 1; height: 0.9rem; background: var(--c-line); border-radius: 999px; overflow: hidden; }
	.task-progress span {
		display: block; height: 100%; background: var(--c-sky); border-radius: 999px;
		transition: width .45s ease; position: relative;
	}
	.task-progress span::after {
		content: ''; position: absolute; top: 3px; left: 8px; right: 8px; height: 3px;
		border-radius: 999px; background: #fff; opacity: 0.45;
	}
	.chip-combo { padding: 0.35rem 0.6rem; font-size: 0.95rem; transition: background .2s, color .2s, opacity .2s; }
	.chip-combo.off { opacity: 0.55; }
	.chip-combo.hot { background: var(--c-orange); color: #fff; box-shadow: 0 0 0 4px #ffe2cc; animation: pulse .4s; }
	@keyframes pulse { 50% { transform: scale(1.15); } }

	.task-meta { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1.25rem 0; flex-wrap: wrap; }
	.task-atom { font-size: 0.875rem; font-weight: 800; color: var(--c-ink-2); }

	.task-area {
		flex: 1;
		padding: 0.85rem 1.25rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}
	.task-loading, .task-error {
		flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
		gap: 1rem; color: var(--c-ink-2); font-weight: 700; text-align: center;
	}
	.spinner {
		width: 36px; height: 36px; border: 4px solid var(--c-line); border-top-color: var(--c-sky);
		border-radius: 50%; animation: spin .7s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }

	.task-card {
		background: #fff;
		border-radius: 24px;
		padding: 1.4rem 1.25rem;
		box-shadow: var(--shadow-sm);
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
		transition: opacity .2s;
	}
	.task-card.dimmed { opacity: 0.6; }
	.task-svg { width: 100%; overflow: hidden; background: var(--c-ground); border-radius: 12px; padding: 0.75rem 0.5rem 0.5rem; }
	.tip-btn {
		align-self: center;
		min-height: 2.75rem;
		display: inline-flex; align-items: center; gap: 0.45rem;
		background: transparent; border: 2px solid var(--c-line); color: var(--c-primary-dark);
		border-radius: 999px; padding: 0.4rem 1rem; font: 800 0.95rem var(--font); cursor: pointer;
	}
	.tip-btn:hover, .tip-btn.active { border-color: var(--c-sky); background: var(--c-primary-light); }
	.step-entry {
		align-self: center; display: inline-flex; align-items: center; gap: 0.4rem; min-height: 2.75rem;
		background: var(--c-orange-light); border: 2px solid var(--c-orange); color: var(--c-orange-text);
		border-radius: 999px; padding: 0.4rem 1rem; font: 900 0.95rem var(--font); cursor: pointer;
	}
	.step-entry:hover { background: #ffe4cc; }

	/* "Warum?" – rationale for the task just answered */
	.why-btn {
		align-self: flex-start;
		min-height: 2.75rem;
		display: inline-flex; align-items: center; gap: 0.4rem;
		background: #fff; border: 2px solid var(--c-line); color: var(--c-navy);
		border-radius: 999px; padding: 0.35rem 1rem; font: 800 0.95rem var(--font); cursor: pointer;
		box-shadow: 0 3px 0 var(--c-line);
	}
	.why-btn:active { transform: translateY(2px); box-shadow: 0 1px 0 var(--c-line); }
	.why-box {
		background: #fff; border-radius: 14px; padding: 0.7rem 0.85rem;
		display: flex; flex-direction: column; gap: 0.45rem;
		text-align: left; color: var(--c-navy); font-size: 0.95rem; line-height: 1.5;
		animation: why-in .2s ease-out;
	}
	@keyframes why-in { from { opacity: 0; transform: translateY(6px); } }
	.why-title { display: flex; align-items: center; gap: 0.35rem; font-weight: 800; color: var(--c-ink-2); font-size: 0.85rem; }
	.why-text { margin: 0; font-weight: 700; }
	.why-steps { font-size: 0.9rem; }
	.why-more {
		align-self: flex-start; background: none; border: 0; padding: 0.35rem 0; min-height: 2.25rem;
		color: var(--c-primary-dark); font: 800 0.85rem var(--font); text-decoration: underline; cursor: pointer;
	}
	@media (prefers-reduced-motion: reduce) { .why-box { animation: none; } }

	.mascot-tip { display: flex; align-items: flex-end; gap: 0.6rem; }
	.mascot-tip .tip-ato { display: block; width: 56px; height: 56px; flex: none; }
	.mascot-tip p {
		background: #fff; border-radius: 16px 16px 16px 4px; padding: 0.6rem 0.9rem;
		font-size: 0.9rem; font-weight: 700; color: #34507a; box-shadow: var(--shadow-sm);
	}
	.submit-error { color: #b91c1c; font-weight: 800; text-align: center; }
	.task-footer { margin-top: auto; position: sticky; bottom: 0; padding-top: 0.5rem; background: linear-gradient(transparent, var(--c-ground) 30%); }
	.task-footer .btn-3d { width: 100%; }
	.pad-dock { position: sticky; bottom: 0; margin-top: auto; z-index: 2; }
	.more-below {
		/* at the right edge, so it does not cover the (centred) answer field */
		position: absolute; right: 0.75rem; bottom: calc(100% - 1.1rem); z-index: 1;
		width: 2.75rem; height: 2.75rem; border-radius: 999px; border: 0; cursor: pointer;
		display: flex; align-items: center; justify-content: center;
		background: var(--c-primary); color: #fff; box-shadow: 0 4px 12px rgba(10, 40, 90, 0.25);
		animation: more-blink 1.4s ease-in-out infinite;
	}
	@keyframes more-blink {
		0%, 100% { opacity: 1; transform: translateY(0); }
		50% { opacity: 0.35; transform: translateY(4px); }
	}
	@media (prefers-reduced-motion: reduce) { .more-below { animation: none; } }

	/* Feedback sheet */
	.sheet {
		position: sticky;
		bottom: 0;
		margin-top: auto;
		border-radius: 32px 32px 0 0;
		padding: 1.25rem 1.25rem calc(1.25rem + env(safe-area-inset-bottom, 0px));
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		max-height: 78svh;
		/* visible so the mascot can stick out above the sheet; the content scrolls in .sheet-body */
		overflow: visible;
		animation: slide-up .28s cubic-bezier(.2, .9, .3, 1);
	}
	.sheet-body {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		min-height: 0;
		flex: 1 1 auto;
		overflow-y: auto;
		overscroll-behavior: contain;
		-webkit-overflow-scrolling: touch;
		/* room for focus rings / shadows that would otherwise be clipped by the scroll box */
		margin: -0.25rem;
		padding: 0.25rem;
	}
	@keyframes slide-up { from { transform: translateY(40%); opacity: 0; } }
	.sheet.correct { background: var(--c-success-light); border-top: 3px solid #86efac; }
	.sheet.wrong { background: #fff7ed; border-top: 3px solid #fdba74; }
	.sheet-mascot { display: block; position: absolute; right: 0.5rem; top: -84px; width: 116px; height: 116px; pointer-events: none; animation: hop .5s cubic-bezier(.3, 1.6, .5, 1) both; }
	.sheet-head { display: flex; align-items: center; gap: 0.75rem; padding-right: 5rem; }
	.sheet.wrong .sheet-head { padding-right: 0; }
	.sheet-ato { display: block; width: 64px; height: 64px; flex: none; margin-left: auto; }
	.sheet-icon {
		width: 3rem; height: 3rem; flex: none; border-radius: 50%;
		display: flex; align-items: center; justify-content: center;
	}
	.sheet.correct .sheet-icon { background: var(--c-success); }
	.sheet.wrong .sheet-icon { background: #ea580c; }
	.sheet-head h2 { font-size: 1.55rem; font-weight: 900; letter-spacing: -0.01em; line-height: 1.15; }
	.sheet.correct h2 { color: #14532d; }
	.sheet.wrong h2 { color: #9a3412; }
	.sheet-head p { font-size: 0.95rem; font-weight: 800; }
	.sheet.correct .sheet-head p { color: var(--c-success-dark); }
	.sheet.wrong .sheet-head p { color: #9a3412; }
	.xp-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.6rem; }
	.xp-tile { background: #fff; border-radius: 16px; padding: 0.7rem 0.85rem; display: flex; align-items: center; gap: 0.6rem; animation: rise .35s both; }
	.xp-tile:nth-child(2) { animation-delay: .1s; }
	.xp-tile > div { display: flex; flex-direction: column; }
	.xp-tile strong { font-size: 1.25rem; font-weight: 900; }
	.xp-tile span { font-size: 0.75rem; font-weight: 800; color: var(--c-ink-2); }
	.gold-text { color: var(--c-gold-text); }
	.orange-text { color: var(--c-orange-text); }
	.green-text { color: var(--c-success-dark); }
	.mastery-box { background: #fff; border-radius: 16px; padding: 0.7rem 0.85rem; display: flex; flex-direction: column; gap: 0.45rem; }
	.mastery-top { display: flex; justify-content: space-between; gap: 0.5rem; font-size: 0.875rem; font-weight: 800; }
	.mastery-bar { height: 0.65rem; }
	.event {
		display: flex; align-items: center; gap: 0.55rem;
		background: #fff; border-radius: 14px; padding: 0.6rem 0.8rem;
		font-weight: 800; font-size: 0.95rem; animation: rise .35s both;
	}
	.event-star { background: #fef3c7; color: #78350f; }
	.event-freeze { padding-block: 0.3rem; }
	.event-ato { display: block; width: 44px; height: 44px; flex: none; }

	/* .task-prompt lives in app.css (rendered via MathText component) */
	.task-sublabel {
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--c-primary);
		background: var(--c-primary-light);
		border-radius: 0.4rem;
		padding: 0.3rem 0.75rem;
		text-align: center;
		align-self: center;
	}
	.answer-area {
		display: flex;
		justify-content: center;
	}
	.input-with-sign {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.sign-btn {
		flex-shrink: 0;
		width: 2.75rem;
		height: 2.75rem;
		border: 2px solid var(--c-gray-300);
		border-radius: var(--radius);
		background: var(--c-gray-50);
		color: var(--c-gray-700);
		font-size: 0.85rem;
		font-weight: 700;
		cursor: pointer;
		transition: border-color .15s, background .15s;
		line-height: 1;
	}
	.sign-btn:hover:not(:disabled) {
		border-color: var(--c-primary);
		background: var(--c-primary-light);
		color: var(--c-primary);
	}
	.sign-btn:disabled { opacity: 0.4; cursor: not-allowed; }

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

		.choice-buttons-multi {
			grid-template-columns: repeat(4, 1fr);
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
	.hint-box {
		background: var(--c-warning-light);
		color: var(--c-warning);
		border-radius: var(--radius);
		padding: 0.6rem 0.75rem;
		font-size: 0.9rem;
		width: 100%;
		text-align: left;
	}
	.pq-steps {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.pq-progress {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--c-primary);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.pq-context {
		background: var(--c-gray-50);
		border: 1px solid var(--c-gray-200);
		border-radius: var(--radius);
		padding: 0.5rem 0.75rem;
		font-size: 0.95rem;
		color: var(--c-gray-700);
	}
	.pq-subprompt {
		font-size: 1rem;
		font-weight: 600;
		color: var(--c-gray-900);
	}
	.step-row {
		display: flex;
		gap: 0.5rem;
		padding: 0.15rem 0;
		align-items: baseline;
	}
	.step-num {
		font-weight: 700;
		color: var(--c-primary);
		flex-shrink: 0;
		min-width: 1.2rem;
	}
	.step-text {
		color: var(--c-gray-800);
	}

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
	/* overrides for the restyled feedback */
	.answer-comparison { background: #fff; border-radius: 16px; padding: 0.25rem; }
	.answer-row { border-radius: 12px; }
	.answer-row-wrong { background: transparent; }
	.answer-row-wrong .answer-value { color: #9a3412; text-decoration: line-through; text-decoration-thickness: 2px; }
	.answer-row-correct { background: var(--c-success-light); }
	.answer-row-correct .answer-value { color: var(--c-success-dark); }
	.answer-label { color: var(--c-ink-2); font-weight: 800; }
	.hint-box { display: flex; gap: 0.45rem; align-items: flex-start; background: #fff; color: #78350f; font-weight: 700; border-radius: 14px; }
	.choice-btn { border-radius: 14px; font-family: var(--font); font-weight: 800; box-shadow: 0 3px 0 var(--c-line); }
	.choice-btn:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 1px 0 var(--c-line); }
	.answer-input { border-radius: 14px; font-family: var(--font); font-weight: 800; border-color: var(--c-line); color: var(--c-navy); }
	.answer-input:focus { border-color: var(--c-sky); box-shadow: 0 0 0 3px var(--c-primary-light); }
</style>
