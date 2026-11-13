<script lang="ts">
	import { onMount } from 'svelte';
	import MathText from './MathText.svelte';
	import {
		applyStep, canExpand, equationTex, formatAnswer, operandSuggestions, parseOperand,
		qTex, status as eqStatus, stepChoices, stepLabel, stepReason, stepTex,
		type Equation, type Step
	} from '$lib/equation.js';

	let {
		equation,
		tex,
		answerType,
		disabled = false,
		onanswer,
		onclose
	}: {
		/** Parsed equation from the task prompt. */
		equation: Equation;
		/** The equation's TeX as written in the task (first line). */
		tex: string;
		answerType: string;
		disabled?: boolean;
		onanswer: (value: string) => void;
		onclose: () => void;
	} = $props();

	type OpKind = 'add' | 'sub' | 'mul' | 'div';
	type Line = { eq: Equation; tex: string; step: Step | null };

	// The first line is the task's own equation as given.
	// svelte-ignore state_referenced_locally
	let lines = $state.raw<Line[]>([{ eq: equation, tex, step: null }]);
	let op = $state<OpKind | null>(null);
	let operand = $state('');
	let message = $state<{ kind: 'error' | 'ok' | 'info'; text: string } | null>(null);
	let guided = $state.raw<{ options: Step[]; best: number; tried: number[] } | null>(null);
	let coarse = $state(false);
	let operandInput = $state<HTMLInputElement | null>(null);
	let linesEl = $state<HTMLElement | null>(null);

	const current = $derived(lines[lines.length - 1].eq);
	const st = $derived(eqStatus(current));
	const finished = $derived(st.kind !== 'open');
	const suggestions = $derived(op ? operandSuggestions(current, op) : []);

	onMount(() => {
		coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
	});

	const OPS: { kind: OpKind; sym: string; label: string; ask: string }[] = [
		{ kind: 'add', sym: '+', label: 'Addieren', ask: 'Auf beiden Seiten addieren:' },
		{ kind: 'sub', sym: '−', label: 'Subtrahieren', ask: 'Auf beiden Seiten subtrahieren:' },
		{ kind: 'mul', sym: '·', label: 'Multiplizieren', ask: 'Beide Seiten multiplizieren mit:' },
		{ kind: 'div', sym: ':', label: 'Dividieren', ask: 'Beide Seiten dividieren durch:' }
	];

	function scrollToEnd() {
		requestAnimationFrame(() => linesEl?.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
	}

	function push(step: Step) {
		const last = lines[lines.length - 1];
		const next = applyStep(last.eq, step);
		lines = [...lines.slice(0, -1), { ...last, step }, { eq: next, tex: equationTex(next), step: null }];
		op = null;
		operand = '';
		guided = null;
		scrollToEnd();
	}

	function pickOp(kind: OpKind) {
		if (disabled || finished) return;
		guided = null;
		message = null;
		if (op === kind) {
			op = null;
			return;
		}
		op = kind;
		operand = '';
		setTimeout(() => operandInput?.focus(), 0);
	}

	function applyOperand() {
		if (!op || disabled) return;
		const v = parseOperand(operand);
		if (!v) {
			message = { kind: 'error', text: 'Gib eine Zahl ein, zum Beispiel 3, −2, 3/4 oder 2x.' };
			return;
		}
		const isConst = v.a.n === 0;
		const value = isConst ? v.b : v.a;
		if (value.n === 0) {
			message = {
				kind: 'error',
				text: op === 'div' ? 'Durch 0 kann man nicht teilen.' : op === 'mul' ? 'Mal 0 macht beide Seiten zu 0. Das hilft nicht weiter.' : 'Mit 0 ändert sich nichts.'
			};
			return;
		}
		if ((op === 'mul' || op === 'div') && !isConst) {
			message = { kind: 'error', text: 'Multiplizieren und Dividieren geht hier nur mit einer Zahl, nicht mit x.' };
			return;
		}
		message = null;
		push(op === 'add' || op === 'sub' ? { kind: op, v } : { kind: op, v: v.b });
	}

	function expand() {
		if (disabled || finished || !canExpand(current)) return;
		message = null;
		push({ kind: 'expand' });
	}

	function swap() {
		if (disabled || finished) return;
		message = null;
		push({ kind: 'swap' });
	}

	function undo() {
		if (disabled || lines.length < 2) return;
		const prev = lines.slice(0, -1);
		prev[prev.length - 1] = { ...prev[prev.length - 1], step: null };
		lines = prev;
		op = null;
		guided = null;
		message = null;
	}

	function showTip() {
		if (disabled || finished) return;
		op = null;
		message = null;
		const c = stepChoices(current);
		guided = c ? { options: c.options, best: c.options.indexOf(c.best), tried: [] } : null;
	}

	function choose(i: number) {
		if (!guided || disabled) return;
		const step = guided.options[i];
		if (i === guided.best) {
			const reason = stepReason(current, step);
			push(step);
			message = { kind: 'ok', text: `Genau. ${reason}` };
		} else {
			guided = { ...guided, tried: [...guided.tried, i] };
			message = { kind: 'info', text: 'Das darfst du machen, es bringt dich hier aber nicht näher ans Ziel. Probier eine andere Möglichkeit.' };
		}
	}

	function key(k: string) {
		if (disabled) return;
		if (k === '⌫') operand = operand.slice(0, -1);
		else if (k === '±') operand = operand.startsWith('-') ? operand.slice(1) : '-' + operand;
		else operand += k;
		message = null;
	}

	function onOperandKey(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			applyOperand();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			op = null;
		}
	}

	function submit() {
		if (st.kind !== 'solved' || disabled) return;
		onanswer(formatAnswer(st.value, answerType));
	}

	// Keep focus in the operand field while tapping keypad buttons.
	const keep = (e: Event) => e.preventDefault();

	const opInfo = $derived(op ? OPS.find((o) => o.kind === op)! : null);
	const PAD = ['7', '8', '9', '⌫', '4', '5', '6', 'x', '1', '2', '3', '/', '±', '0', ','];
</script>

<div class="eqs" aria-label="Gleichung Schritt für Schritt lösen">
	<div class="eqs-head">
		<span class="eqs-title">Schritt für Schritt</span>
		<button type="button" class="link-btn" onclick={onclose} {disabled}>Zurück zur normalen Eingabe</button>
	</div>

	<ol class="lines" bind:this={linesEl}>
		{#each lines as line, i (i)}
			<li class:current={i === lines.length - 1}>
				<span class="eq"><MathText text={`\\(${line.tex}\\)`} /></span>
				<span class="op">
					{#if line.step && (line.step.kind === 'expand' || line.step.kind === 'swap')}
						<span class="op-text">{line.step.kind === 'expand' ? 'Klammer auflösen' : 'Seiten tauschen'}</span>
					{:else if line.step}
						<MathText text={`\\(\\mid ${stepTex(line.step)}\\)`} />
					{/if}
				</span>
			</li>
		{/each}
	</ol>

	{#if message}
		<p class="msg msg-{message.kind}" role="status">{message.text}</p>
	{/if}

	{#if st.kind === 'solved'}
		<div class="done">
			<p>Geschafft! <MathText text={`\\(x = ${qTex(st.value)}\\)`} /></p>
			<button type="button" class="btn-3d" onclick={submit} {disabled}>Antwort abgeben</button>
		</div>
	{:else if st.kind === 'always' || st.kind === 'never'}
		<div class="msg msg-info">
			{st.kind === 'always' ? 'Jetzt steht links und rechts dasselbe. Das x ist verschwunden.' : 'Das stimmt nie. Das x ist verschwunden.'}
			Mach den letzten Schritt rückgängig und probier einen anderen.
		</div>
	{/if}

	{#if guided && !finished}
		<div class="guided">
			<p class="guided-q">Was ist ein guter nächster Schritt?</p>
			{#each guided.options as s, i}
				<button type="button" class="choice" class:tried={guided.tried.includes(i)} onclick={() => choose(i)} disabled={disabled || guided.tried.includes(i)}>
					{stepLabel(s)}
				</button>
			{/each}
		</div>
	{/if}

	{#if opInfo && !finished}
		<div class="sheet">
			<label class="sheet-q" for="eqs-operand">{opInfo.ask}</label>
			<div class="sheet-row">
				<span class="sheet-sym" aria-hidden="true">{opInfo.sym}</span>
				<input
					id="eqs-operand"
					bind:this={operandInput}
					bind:value={operand}
					onkeydown={onOperandKey}
					inputmode={coarse ? 'none' : 'text'}
					autocomplete="off"
					placeholder={op === 'add' || op === 'sub' ? 'z. B. 3 oder 2x' : 'z. B. 4'}
					{disabled}
				/>
				<button type="button" class="apply" onclick={applyOperand} disabled={disabled || !operand.trim()}>Anwenden</button>
			</div>
			{#if suggestions.length}
				<div class="quick" aria-label="Zahlen aus der Gleichung">
					{#each suggestions as s}
						<button type="button" onpointerdown={keep} onmousedown={keep} onclick={() => { operand = s; message = null; }} {disabled}>{s}</button>
					{/each}
				</div>
			{/if}
			<div class="pad">
				{#each PAD as k}
					{#if k !== 'x' || op === 'add' || op === 'sub'}
						<button type="button" onpointerdown={keep} onmousedown={keep} onclick={() => key(k)} {disabled} aria-label={k === '⌫' ? 'Löschen' : k === '±' ? 'Vorzeichen wechseln' : k === '/' ? 'Bruchstrich' : undefined}>{k}</button>
					{:else}
						<span></span>
					{/if}
				{/each}
			</div>
		</div>
	{/if}

	<div class="tools">
		{#if !finished}
			{#each OPS as o}
				<button type="button" class="tool" class:sel={op === o.kind} onclick={() => pickOp(o.kind)} {disabled} aria-pressed={op === o.kind}>
					<span class="sym" aria-hidden="true">{o.sym}</span>{o.label}
				</button>
			{/each}
			<button type="button" class="tool wide" onclick={expand} disabled={disabled || !canExpand(current)}>
				<span class="sym small" aria-hidden="true">( )</span>Klammer auflösen
			</button>
			<button type="button" class="tool wide" onclick={swap} {disabled}>
				<span class="sym small" aria-hidden="true">⇄</span>Seiten tauschen
			</button>
		{/if}
		<button type="button" class="tool wide" onclick={undo} disabled={disabled || lines.length < 2}>
			<span class="sym small" aria-hidden="true">↶</span>Rückgängig
		</button>
		{#if !finished}
			<button type="button" class="tool wide tip" class:sel={!!guided} onclick={showTip} {disabled}>
				<span class="sym small" aria-hidden="true">?</span>Tipp
			</button>
		{/if}
	</div>
</div>

<style>
	.eqs {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		width: 100%;
		text-align: left;
	}
	.eqs-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.eqs-title {
		font-size: 0.72rem;
		font-weight: 900;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--c-orange-text);
	}
	.link-btn {
		background: none;
		border: none;
		padding: 0.25rem 0;
		color: var(--c-primary);
		font-weight: 800;
		font-size: 0.82rem;
	}

	.lines {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 15rem;
		overflow-y: auto;
	}
	.lines li {
		display: grid;
		grid-template-columns: 1fr minmax(4.2rem, auto);
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0.6rem;
		border-radius: 0.6rem;
		color: var(--c-ink-2);
		font-size: 1.05rem;
	}
	.lines li.current {
		background: var(--c-primary-light);
		color: var(--c-navy);
		font-size: 1.3rem;
		box-shadow: inset 0 0 0 2px var(--c-sky);
	}
	.eq {
		text-align: center;
		min-width: 0;
		overflow-x: auto;
	}
	.op {
		font-size: 0.95rem;
		color: var(--c-orange-text);
		border-left: 2px solid var(--c-line);
		padding-left: 0.5rem;
		min-height: 1.4em;
	}
	.op-text {
		font-size: 0.72rem;
		font-weight: 800;
		line-height: 1.15;
		display: block;
	}

	.msg {
		margin: 0;
		border-radius: 0.6rem;
		padding: 0.5rem 0.75rem;
		font-size: 0.88rem;
		font-weight: 700;
	}
	.msg-error { background: var(--c-error-light); color: var(--c-error); }
	.msg-ok { background: var(--c-success-light); color: var(--c-success-dark); }
	.msg-info { background: var(--c-warning-light); color: var(--c-gold-text); }

	.done {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.6rem;
		background: var(--c-success-light);
		border-radius: 0.9rem;
		padding: 0.75rem;
	}
	.done p {
		margin: 0;
		font-weight: 900;
		color: var(--c-success-dark);
		font-size: 1.05rem;
	}

	.guided {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}
	.guided-q {
		margin: 0;
		font-weight: 800;
		font-size: 0.92rem;
		color: var(--c-navy);
	}
	.choice {
		text-align: left;
		border: 2px solid var(--c-line);
		background: #fff;
		color: var(--c-navy);
		border-radius: 0.75rem;
		padding: 0.6rem 0.8rem;
		font-weight: 800;
		font-size: 0.95rem;
	}
	.choice:hover:not(:disabled) { border-color: var(--c-sky); }
	.choice.tried { opacity: 0.5; text-decoration: line-through; }

	.sheet {
		border: 2px solid var(--c-orange);
		background: var(--c-orange-light);
		border-radius: 0.9rem;
		padding: 0.65rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.sheet-q {
		font-weight: 800;
		font-size: 0.85rem;
		color: var(--c-orange-text);
	}
	.sheet-row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	.sheet-sym {
		font-size: 1.4rem;
		font-weight: 900;
		color: var(--c-orange-text);
		width: 1.2rem;
		text-align: center;
	}
	.sheet-row input {
		flex: 1;
		min-width: 0;
		border: 2px solid var(--c-orange);
		border-radius: 0.6rem;
		padding: 0.45rem 0.65rem;
		font-size: 1.2rem;
		font-weight: 800;
		color: var(--c-navy);
		background: #fff;
	}
	.sheet-row input:focus { outline: 3px solid var(--c-sky-soft); outline-offset: 1px; }
	.apply {
		border: none;
		border-radius: 0.6rem;
		background: var(--c-success);
		color: #fff;
		font-weight: 900;
		padding: 0.6rem 0.9rem;
		font-size: 0.9rem;
	}
	.apply:disabled { opacity: 0.45; cursor: not-allowed; }
	.quick {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.quick button {
		background: #fff;
		border: 1.5px solid var(--c-line);
		border-radius: 0.5rem;
		padding: 0.2rem 0.7rem;
		font-weight: 800;
		font-size: 1rem;
		color: var(--c-navy);
	}
	.pad {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.35rem;
	}
	.pad button {
		background: #fff;
		border: 1.5px solid var(--c-line);
		border-radius: 0.55rem;
		padding: 0.45rem 0;
		font-size: 1.1rem;
		font-weight: 800;
		color: var(--c-navy);
	}
	.pad button:active:not(:disabled) { background: var(--c-primary-light); }

	.tools {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.45rem;
	}
	.tool {
		border: 2px solid var(--c-line);
		background: #fff;
		color: var(--c-navy);
		border-radius: 0.75rem;
		padding: 0.45rem 0.15rem 0.35rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1px;
		font-weight: 800;
		font-size: 0.68rem;
		min-width: 0;
	}
	.tool .sym {
		font-size: 1.35rem;
		line-height: 1.1;
		font-weight: 900;
	}
	.tool .sym.small { font-size: 0.95rem; }
	.tool.wide {
		grid-column: span 2;
		flex-direction: row;
		justify-content: center;
		gap: 0.4rem;
		font-size: 0.78rem;
		padding: 0.55rem 0.3rem;
	}
	.tool.sel {
		border-color: var(--c-orange);
		background: var(--c-orange-light);
		color: var(--c-orange-text);
	}
	.tool.tip:not(.sel) { color: var(--c-primary); }
	.tool:hover:not(:disabled):not(.sel) { border-color: var(--c-sky); }
	.tool:disabled { opacity: 0.4; cursor: not-allowed; }
	button:focus-visible { outline: 3px solid var(--c-sky); outline-offset: 2px; }
</style>
