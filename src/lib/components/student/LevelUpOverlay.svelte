<script lang="ts">
	import { onMount } from 'svelte';
	import { levelProgress } from '$lib/gamification.js';

	let { level, xp, onclose }: { level: number; xp: number; onclose: () => void } = $props();

	const next = $derived(levelProgress(xp, level));
	const fmt = (n: number) => n.toLocaleString('de-DE');

	let continueBtn = $state<HTMLButtonElement | null>(null);
	onMount(() => continueBtn?.focus());

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' || e.key === 'Enter') {
			// Swallow Enter so it doesn't also advance the task behind the overlay
			e.preventDefault();
			e.stopPropagation();
			onclose();
		}
	}
</script>

<svelte:window onkeydowncapture={onkeydown} />

<div class="overlay" role="dialog" aria-modal="true" aria-labelledby="levelup-title">
	<svg class="confetti" viewBox="0 0 390 420" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
		<g stroke-linecap="round" stroke-width="6">
			<path d="M60 90 l14 -18" stroke="#fcd34d" /><path d="M320 80 l-8 -20" stroke="#38bdf8" />
			<path d="M340 250 l20 -6" stroke="#f97316" /><path d="M40 260 l-18 -8" stroke="#34d399" />
			<path d="M110 40 l4 -16" stroke="#f97316" /><path d="M270 30 l12 -10" stroke="#34d399" />
		</g>
		<g fill="#fcd34d"><circle cx="90" cy="170" r="4" /><circle cx="300" cy="160" r="3" /><circle cx="200" cy="30" r="3" /></g>
	</svg>

	<div class="inner">
		<span class="eyebrow">Level-Up!</span>

		<div class="star-badge">
			<svg viewBox="0 0 200 200" aria-hidden="true">
				<circle cx="100" cy="100" r="96" fill="#fff" fill-opacity="0.08" />
				<circle cx="100" cy="100" r="78" fill="#fff" fill-opacity="0.12" />
				<path d="m100 22 22 48 52 6-38 36 10 52-46-26-46 26 10-52-38-36 52-6Z" fill="#fcd34d" stroke="#fff" stroke-width="4" stroke-linejoin="round" />
			</svg>
			<span class="level-num">{level}</span>
		</div>

		<div class="text">
			<h1 id="levelup-title">Du bist jetzt Level {level}</h1>
			<p>{fmt(xp)} XP gesammelt – jede Aufgabe hat sich gelohnt.</p>
		</div>

		<div class="quote">
			<img src="/mascot.png" alt="" />
			<p>
				{#if next.nextLevelXp}
					„Wow! Bis Level {level + 1} sind es {fmt(next.remaining)} XP. Ich glaub an dich!“
				{:else}
					„Höchstes Level erreicht – du bist ein echter Mathe-Profi!“
				{/if}
			</p>
		</div>

		<div class="actions">
			<button class="btn-3d gold" bind:this={continueBtn} onclick={onclose}>Weiter üben</button>
			<a href="/badges" class="link" onclick={onclose}>Meine Abzeichen ansehen</a>
		</div>
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 50;
		background: var(--c-primary-dark);
		color: #fff;
		overflow-y: auto;
		animation: fade .25s ease;
	}
	@keyframes fade { from { opacity: 0; } }
	.confetti { position: absolute; top: 0; left: 0; width: 100%; height: 420px; pointer-events: none; }
	.inner {
		position: relative;
		max-width: 440px;
		min-height: 100%;
		margin: 0 auto;
		padding: 2.5rem 1.5rem calc(1.5rem + env(safe-area-inset-bottom, 0px));
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.1rem;
		text-align: center;
	}
	.eyebrow { font-size: 0.95rem; font-weight: 900; color: #bfdbfe; text-transform: uppercase; letter-spacing: 0.1em; }
	.star-badge {
		position: relative;
		width: 200px;
		height: 200px;
		display: flex;
		align-items: center;
		justify-content: center;
		animation: pop .7s cubic-bezier(.3, 1.6, .5, 1) both;
	}
	.star-badge svg { position: absolute; inset: 0; width: 100%; height: 100%; }
	.level-num { position: relative; font-size: 4rem; font-weight: 900; color: var(--c-navy); margin-top: 0.9rem; }
	@keyframes pop { from { transform: scale(0.3) rotate(-20deg); opacity: 0; } }
	.text h1 { font-size: 2rem; font-weight: 900; letter-spacing: -0.02em; line-height: 1.15; }
	.text p { font-weight: 700; color: #bfdbfe; margin-top: 0.35rem; }
	.quote {
		align-self: stretch;
		background: var(--c-navy-2);
		border: 2px solid #2b5a9e;
		border-radius: 20px;
		padding: 0.9rem 1rem;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		text-align: left;
	}
	.quote img { width: 64px; height: 64px; object-fit: contain; flex: none; }
	.quote p { font-weight: 700; color: #e0f2fe; line-height: 1.4; }
	.actions { margin-top: auto; align-self: stretch; display: flex; flex-direction: column; gap: 0.5rem; }
	.btn-3d.gold { background: var(--c-star); color: var(--c-navy); box-shadow: 0 5px 0 #b45309; }
	.btn-3d.gold:active { box-shadow: 0 1px 0 #b45309; }
	.link {
		min-height: 2.75rem;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #fff;
		font-weight: 800;
		text-decoration: none;
	}
	.link:hover { text-decoration: underline; }
</style>
