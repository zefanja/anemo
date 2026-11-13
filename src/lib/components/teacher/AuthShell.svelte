<script lang="ts">
	// Shared frame for login / password reset in the teacher area.
	let { title, subtitle, children }: { title: string; subtitle?: string; children: import('svelte').Snippet } = $props();
</script>

<div class="auth">
	<aside class="hero">
		<div class="brand">
			<span class="mark" aria-hidden="true">a</span>
			<span class="brand-text"><span class="logo">anemo</span><span class="area">Lehrerbereich</span></span>
		</div>
		<div class="hero-copy">
			<img src="/mascot.png" alt="" class="mascot" width="160" height="160" />
			<p class="claim">Lernlücken sehen, bevor sie groß werden.</p>
			<p class="claim-sub">Klassen verwalten, Fortschritt verfolgen und gezielt unterstützen.</p>
		</div>
	</aside>

	<main class="panel">
		<div class="card auth-card">
			<div class="mobile-brand">
				<span class="mark" aria-hidden="true">a</span>
				<span class="brand-text"><span class="logo dark">anemo</span><span class="area dark">Lehrerbereich</span></span>
			</div>
			<h1>{title}</h1>
			{#if subtitle}<p class="sub">{subtitle}</p>{/if}
			{@render children()}
		</div>
	</main>
</div>

<style>
	.auth { min-height: 100dvh; display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); }
	.hero {
		background: var(--c-navy); color: #fff; padding: 2.5rem 3rem;
		display: flex; flex-direction: column; justify-content: space-between; gap: 2rem;
	}
	.brand, .mobile-brand { display: flex; align-items: center; gap: 0.7rem; }
	.mark {
		width: 2.5rem; height: 2.5rem; border-radius: 13px; background: var(--c-sky); color: var(--c-navy);
		display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 1.35rem; flex: none;
	}
	.brand-text { display: flex; flex-direction: column; line-height: 1.1; }
	.logo { font-weight: 900; font-size: 1.35rem; letter-spacing: -0.02em; color: #fff; }
	.area { font-size: 0.7rem; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; color: #8fb0da; }
	.logo.dark { color: var(--c-navy); }
	.area.dark { color: var(--c-ink-2); }
	.hero-copy { display: flex; flex-direction: column; gap: 0.75rem; max-width: 26rem; margin-bottom: 3rem; }
	.mascot { width: 9rem; height: auto; margin-bottom: 0.5rem; }
	.claim { font-size: 2rem; font-weight: 900; line-height: 1.2; }
	.claim-sub { font-size: 1.05rem; font-weight: 700; color: #bfdbfe; }

	.panel { display: flex; align-items: center; justify-content: center; padding: 2rem 1.25rem; }
	.auth-card { width: 100%; max-width: 26rem; padding: 2rem 1.75rem; display: flex; flex-direction: column; gap: 1rem; }
	.mobile-brand { display: none; }
	h1 { font-size: 1.6rem; font-weight: 900; margin: 0; color: var(--c-navy); }
	.sub { font-size: 0.95rem; font-weight: 700; color: var(--c-ink-2); margin-top: -0.5rem; }

	@media (max-width: 899px) {
		.auth { grid-template-columns: minmax(0, 1fr); }
		.hero { display: none; }
		.panel { align-items: flex-start; padding: 2rem 1rem; }
		.mobile-brand { display: flex; margin-bottom: 0.5rem; }
		.auth-card { padding: 1.5rem 1.25rem; }
	}
</style>
