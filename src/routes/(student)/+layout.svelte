<script lang="ts">
	import { page } from '$app/stores';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	const LEVEL_THRESHOLDS = [0, 100, 250, 500, 900, 1400, 2000, 3000, 4500, 6500, 9000];

	function xpProgress(xp: number, level: number): number {
		const lo = LEVEL_THRESHOLDS[level - 1] ?? 0;
		const hi = LEVEL_THRESHOLDS[level] ?? lo + 1000;
		if (hi <= lo) return 100;
		return Math.min(100, Math.round(((xp - lo) / (hi - lo)) * 100));
	}

	let progress = $derived(xpProgress(data.xp, data.level));
	let currentPath = $derived($page.url.pathname);
</script>

<div class="layout">
	<header class="gami-bar">
		<div class="gami-left">
			<span class="level-badge">Lv&nbsp;{data.level}</span>
			<div class="xp-track" aria-label="XP Fortschritt {progress}%">
				<div class="xp-fill" style="width: {progress}%"></div>
			</div>
			<span class="xp-label">{data.xp} XP</span>
		</div>
		<div class="gami-right">
			<span class="streak" title="Tages-Streak">🔥&nbsp;{data.streakDays}</span>
			<span class="student-name">{data.studentName}</span>
		</div>
	</header>

	<main class="main">
		{@render children()}
	</main>

	<nav class="bottom-nav" aria-label="Navigation">
		<a href="/practice" class="nav-item" class:active={currentPath.startsWith('/practice')}>
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
			</svg>
			<span>Üben</span>
		</a>
		<a href="/progress" class="nav-item" class:active={currentPath.startsWith('/progress')}>
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
			</svg>
			<span>Fortschritt</span>
		</a>
		<a href="/logout" class="nav-item nav-logout">
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
			</svg>
			<span>Abmelden</span>
		</a>
	</nav>
</div>

<style>
	.layout {
		display: flex;
		flex-direction: column;
		height: 100svh;
		overflow: hidden;
	}

	/* ── Gamification bar ── */
	.gami-bar {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 1rem;
		background: var(--c-primary);
		color: #fff;
		height: 52px;
	}
	.gami-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 1;
		min-width: 0;
	}
	.level-badge {
		font-weight: 700;
		font-size: 0.85rem;
		white-space: nowrap;
		background: rgba(255,255,255,.2);
		border-radius: 999px;
		padding: 0.15rem 0.5rem;
	}
	.xp-track {
		flex: 1;
		height: 8px;
		background: rgba(255,255,255,.25);
		border-radius: 999px;
		overflow: hidden;
		min-width: 40px;
	}
	.xp-fill {
		height: 100%;
		background: #fbbf24;
		border-radius: 999px;
		transition: width .4s ease;
	}
	.xp-label {
		font-size: 0.75rem;
		white-space: nowrap;
		opacity: .85;
	}
	.gami-right {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-left: 0.75rem;
	}
	.streak {
		font-size: 0.9rem;
		white-space: nowrap;
	}
	.student-name {
		font-size: 0.8rem;
		opacity: .85;
		max-width: 80px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* ── Main content ── */
	.main {
		flex: 1;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
	}

	/* ── Bottom nav ── */
	.bottom-nav {
		flex-shrink: 0;
		display: flex;
		border-top: 1px solid var(--c-gray-200);
		background: #fff;
		padding-bottom: env(safe-area-inset-bottom, 0);
	}
	.nav-item {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		padding: 0.5rem 0;
		text-decoration: none;
		color: var(--c-gray-400);
		font-size: 0.7rem;
		font-weight: 500;
		transition: color .15s;
		min-height: 56px;
	}
	.nav-item.active {
		color: var(--c-primary);
	}
	.nav-logout {
		color: var(--c-gray-400);
	}
	.nav-logout:hover {
		color: var(--c-error);
	}
</style>
