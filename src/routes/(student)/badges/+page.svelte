<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/student/Icon.svelte';
	import { BADGES, levelProgress, type BadgeDef } from '$lib/gamification.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const ALL_ATOMS_TARGET = 95;

	const earned = $derived(new Set<string>(data.badges.map((b) => b.type)));
	const level = $derived(levelProgress(data.xp, data.level));

	function current(b: BadgeDef): number {
		if (b.metric === 'mastered') return data.masteredCount;
		if (b.metric === 'streak') return data.streakDays;
		if (b.metric === 'xp') return data.xp;
		return 0;
	}
	function target(b: BadgeDef): number | null {
		return b.type === 'atoms_all' ? ALL_ATOMS_TARGET : b.target;
	}
	function icon(b: BadgeDef): 'star' | 'flame' | 'bolt' | 'sparkle' {
		return b.category === 'atoms' ? 'star' : b.category === 'streak' ? 'flame' : b.category === 'xp' ? 'bolt' : 'sparkle';
	}
	const fmt = (n: number) => n.toLocaleString('de-DE');

	const items = $derived(
		BADGES.map((b) => {
			const t = target(b);
			const c = current(b);
			return {
				...b,
				earned: earned.has(b.type),
				icon: icon(b),
				progress: t ? Math.min(1, c / t) : 0,
				progressLabel: t ? `${fmt(Math.min(c, t))} / ${fmt(t)}` : 'Geheim'
			};
		})
	);

	// Next badge = unearned badge with a measurable target and the highest progress
	const next = $derived(
		items
			.filter((b) => !b.earned && target(b) !== null && b.progress < 1)
			.sort((a, b) => b.progress - a.progress)[0] ?? null
	);
	const earnedCount = $derived(items.filter((b) => b.earned).length);

	// ── Class leaderboard ──
	type LbPeriod = 'day' | 'week' | 'month' | 'all';
	const LB_TABS: { key: LbPeriod; label: string }[] = [
		{ key: 'day', label: 'Heute' },
		{ key: 'week', label: 'Woche' },
		{ key: 'month', label: 'Monat' },
		{ key: 'all', label: 'Gesamt' }
	];
	let lbPeriod = $state<LbPeriod>('day');
	const lbEntries = $derived(lbPeriod === 'all' ? data.leaderboard : data.periodBoards[lbPeriod]);

	// Competition ranking: equal XP → equal place (1, 2, 2, 4, …)
	const lbRanks = $derived.by(() => {
		const ranks: number[] = [];
		lbEntries.forEach((e, i) => {
			ranks.push(i > 0 && e.xp === lbEntries[i - 1].xp ? ranks[i - 1] : i);
		});
		return ranks;
	});
	const myIndex = $derived(lbEntries.findIndex((e) => e.id === data.studentId));
	const myRank = $derived(myIndex >= 0 ? lbRanks[myIndex] : -1);
	// myRank is the index of the first entry in my tie group, so the entry right
	// before it is the closest one with more XP
	const xpToNextRank = $derived(myRank > 0 ? lbEntries[myRank - 1].xp - lbEntries[myIndex].xp + 1 : 0);

	function rankIcon(i: number): string {
		return i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
	}
	function isoWeek(d: Date): number {
		const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
		const day = t.getUTCDay() || 7;
		t.setUTCDate(t.getUTCDate() + 4 - day);
		const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
		return Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
	}
	const MONTH_FULL = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
	const lbPeriodText = $derived.by(() => {
		const now = new Date();
		if (lbPeriod === 'day') return 'heute';
		if (lbPeriod === 'week') return `diese Woche (KW ${isoWeek(now)})`;
		if (lbPeriod === 'month') return `im ${MONTH_FULL[now.getMonth()]}`;
		return 'insgesamt';
	});
	const lbEmptyText = $derived(
		lbPeriod === 'day'
			? 'Heute hat noch niemand XP gesammelt. Hol dir Platz 1!'
			: lbPeriod === 'week'
				? 'Diese Woche hat noch niemand XP gesammelt. Hol dir Platz 1!'
				: 'Diesen Monat hat noch niemand XP gesammelt. Hol dir Platz 1!'
	);
</script>

<svelte:head><title>Anemo – Abzeichen</title></svelte:head>

<div class="page">
	<h1>Abzeichen</h1>

	<section class="level-card" aria-label="Dein Level">
		<div class="level-box">
			<span>LEVEL</span>
			<strong>{data.level}</strong>
		</div>
		<div class="level-info">
			<strong>{fmt(data.xp)} XP gesammelt</strong>
			<div class="bar" role="progressbar" aria-label="Fortschritt zum nächsten Level" aria-valuemin="0" aria-valuemax="100" aria-valuenow={level.pct}>
				<span style="width: {level.pct}%"></span>
			</div>
			<span class="muted">{level.nextLevelXp ? `Noch ${fmt(level.remaining)} XP bis Level ${data.level + 1}` : 'Höchstes Level erreicht!'}</span>
		</div>
	</section>

	{#if next}
		<section class="next-card" aria-label="Nächstes Abzeichen">
			<span class="next-disc"><Icon name={next.icon} size={26} color="var(--c-orange)" /></span>
			<div class="next-info">
				<span class="eyebrow">Als Nächstes</span>
				<strong>{next.name} · {next.desc}</strong>
				<div class="bar next-bar"><span style="width: {Math.round(next.progress * 100)}%; background: var(--c-orange)"></span></div>
				<span class="next-progress">{next.progressLabel}</span>
			</div>
		</section>
	{/if}

	{#if data.showLeaderboard && data.leaderboard.length > 1}
		<section aria-labelledby="lb-title" class="lb">
			<div class="section-head">
				<h2 id="lb-title">Rangliste – Meine Klasse</h2>
				<form method="POST" action="?/toggleLeaderboard" use:enhance={() => () => invalidate('app:gami')}>
					<button type="submit" class="lb-toggle">
						{data.studentHidesLeaderboard ? 'Einblenden' : 'Ausblenden'}
					</button>
				</form>
			</div>
			{#if data.studentHidesLeaderboard}
				<p class="lb-hidden">Die Rangliste ist ausgeblendet. Du kannst sie jederzeit wieder einblenden.</p>
			{:else}
				<div class="lb-card">
					<div class="lb-tabs" role="tablist" aria-label="Zeitraum der Rangliste">
						{#each LB_TABS as tab}
							<button
								type="button"
								role="tab"
								aria-selected={lbPeriod === tab.key}
								class="lb-tab"
								class:active={lbPeriod === tab.key}
								onclick={() => (lbPeriod = tab.key)}
							>
								{tab.label}
							</button>
						{/each}
					</div>
					{#if lbEntries.length === 0}
						<p class="lb-empty">{lbEmptyText}</p>
					{:else}
						<p class="lb-my-rank">
							{#if myRank >= 0}
								Du bist {lbPeriodText} auf Platz <strong>{myRank + 1}</strong> von {lbEntries.length}
								{#if myRank === 0} – du führst die Rangliste an!
								{:else if myRank < 3} – weiter so!
								{:else}
									– noch <strong>{fmt(xpToNextRank)} XP</strong> bis zum nächsten Platz!
								{/if}
							{:else}
								Du hast {lbPeriodText} noch keine XP. Schon ein paar Aufgaben bringen dich auf die Liste!
							{/if}
						</p>
						<ul class="lb-list">
							{#each lbEntries as entry, i (entry.id)}
								<li class="lb-row" class:me={entry.id === data.studentId} class:top3={lbRanks[i] < 3}>
									<span class="lb-pos">{rankIcon(lbRanks[i])}</span>
									<span class="lb-name">{entry.id === data.studentId ? 'Du' : entry.displayName}</span>
									{#if lbPeriod === 'all'}<span class="lb-lv">Lv.{entry.level}</span>{/if}
									<span class="lb-xp">{lbPeriod === 'all' ? '' : '+'}{fmt(entry.xp)} XP</span>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}
		</section>
	{/if}

	<section aria-labelledby="collection-title">
		<div class="section-head">
			<h2 id="collection-title">Deine Sammlung</h2>
			<span class="muted">{earnedCount} von {items.length}</span>
		</div>
		<ul class="grid">
			{#each items as b}
				<li class="badge" class:earned={b.earned}>
					<span class="disc {b.category}">
						{#if b.earned}
							<Icon name={b.icon} size={26} color="#fff" />
						{:else}
							<Icon name="lock" size={22} color="#6b7c99" />
						{/if}
					</span>
					<strong>{b.name}</strong>
					<span class="desc">{b.desc}</span>
					{#if !b.earned && b.progress > 0}
						<span class="mini-bar"><span style="width: {Math.round(b.progress * 100)}%"></span></span>
						<span class="desc">{b.progressLabel}</span>
					{/if}
					<span class="sr-only">{b.earned ? 'erreicht' : 'noch nicht erreicht'}</span>
				</li>
			{/each}
		</ul>
	</section>
</div>

<style>
	.page {
		max-width: 640px;
		margin: 0 auto;
		padding: 1.4rem 1.25rem 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	h1 { font-size: 1.65rem; font-weight: 900; letter-spacing: -0.01em; }
	h2 { font-size: 1.15rem; font-weight: 900; }
	.muted { font-size: 0.85rem; font-weight: 800; color: var(--c-ink-2); }
	.eyebrow { font-size: 0.75rem; font-weight: 900; color: var(--c-orange-text); text-transform: uppercase; letter-spacing: 0.06em; }

	.lb { display: flex; flex-direction: column; gap: 0.6rem; }
	.lb .section-head { margin-bottom: 0; align-items: center; }
	.lb-toggle {
		font: 800 0.75rem var(--font); color: var(--c-ink-2); background: none;
		border: 1.5px solid var(--c-line); border-radius: 999px; padding: 0.2rem 0.7rem;
	}
	.lb-toggle:hover { color: var(--c-primary); border-color: var(--c-primary); }
	.lb-hidden { font-size: 0.85rem; font-weight: 700; color: var(--c-ink-2); background: #fff; border-radius: 16px; padding: 0.8rem 1rem; text-align: center; }
	.lb-card { background: #fff; border-radius: 20px; padding: 1rem; box-shadow: var(--shadow-sm); }
	.lb-tabs {
		display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.25rem;
		background: var(--c-track); border-radius: 999px; padding: 0.2rem; margin-bottom: 0.75rem;
	}
	.lb-tab { font: 800 0.8rem var(--font); color: var(--c-ink-2); background: none; border: none; border-radius: 999px; padding: 0.4rem 0.25rem; }
	.lb-tab:hover { color: var(--c-primary); }
	.lb-tab.active { background: #fff; color: var(--c-primary); box-shadow: var(--shadow-sm); }
	.lb-empty { font-size: 0.875rem; font-weight: 700; color: var(--c-ink-2); text-align: center; padding: 0.75rem 0.5rem; }
	.lb-my-rank { font-size: 0.875rem; font-weight: 700; color: #34507a; margin-bottom: 0.6rem; padding-bottom: 0.6rem; border-bottom: 1px solid var(--c-track); }
	.lb-list { list-style: none; display: flex; flex-direction: column; gap: 0.25rem; }
	.lb-row { display: flex; align-items: center; gap: 0.6rem; padding: 0.45rem 0.6rem; border-radius: 12px; font-size: 0.9rem; font-weight: 700; }
	.lb-row.top3 { background: #fffbeb; }
	.lb-row.me { background: var(--c-primary-light); outline: 1.5px solid var(--c-primary); font-weight: 900; }
	.lb-pos { width: 1.8rem; text-align: center; font-weight: 900; flex-shrink: 0; }
	.lb-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.lb-lv { font-size: 0.75rem; color: var(--c-ink-2); white-space: nowrap; }
	.lb-xp { font-size: 0.85rem; font-weight: 900; color: var(--c-primary); white-space: nowrap; }

	.level-card {
		background: #fff; border-radius: 22px; padding: 1rem;
		display: flex; align-items: center; gap: 0.9rem; box-shadow: var(--shadow-sm);
	}
	.level-box {
		width: 4rem; height: 4rem; flex: none; border-radius: 20px;
		background: var(--c-primary); color: #fff; box-shadow: 0 4px 0 var(--c-primary-dark);
		display: flex; flex-direction: column; align-items: center; justify-content: center;
	}
	.level-box span { font-size: 0.65rem; font-weight: 900; letter-spacing: 0.08em; }
	.level-box strong { font-size: 1.75rem; font-weight: 900; line-height: 1; }
	.level-info { flex: 1; display: flex; flex-direction: column; gap: 0.35rem; }
	.level-info strong { font-size: 1.05rem; font-weight: 900; }

	.next-card {
		background: var(--c-orange-light); border: 2px solid #fdba74; border-radius: 20px;
		padding: 0.9rem 1rem; display: flex; align-items: center; gap: 0.85rem;
	}
	.next-disc {
		width: 3.25rem; height: 3.25rem; flex: none; border-radius: 50%;
		background: #fff; border: 3px dashed var(--c-orange);
		display: flex; align-items: center; justify-content: center;
	}
	.next-info { flex: 1; display: flex; flex-direction: column; gap: 0.25rem; }
	.next-info strong { font-size: 1rem; font-weight: 900; }
	.next-bar { background: #fff; height: 0.5rem; }
	.next-progress { font-size: 0.75rem; font-weight: 800; color: #9a3412; }

	.section-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.6rem; }
	.grid { list-style: none; display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 0.6rem; }
	.badge {
		background: #fff; border-radius: 18px; padding: 0.8rem 0.4rem 0.7rem;
		display: flex; flex-direction: column; align-items: center; gap: 0.3rem;
		text-align: center; box-shadow: var(--shadow-sm);
	}
	.badge strong { font-size: 0.85rem; font-weight: 900; line-height: 1.2; }
	.desc { font-size: 0.7rem; font-weight: 800; color: var(--c-ink-2); line-height: 1.25; }
	.disc {
		width: 3.25rem; height: 3.25rem; border-radius: 50%;
		display: flex; align-items: center; justify-content: center;
		background: var(--c-track); border: 2px dashed #b6c4d8;
	}
	.earned .disc { border: 0; }
	.earned .disc.atoms { background: var(--c-gold); box-shadow: 0 4px 0 #b45309; }
	.earned .disc.streak { background: var(--c-orange); box-shadow: 0 4px 0 var(--c-orange-text); }
	.earned .disc.xp { background: var(--c-primary); box-shadow: 0 4px 0 var(--c-primary-dark); }
	.earned .disc.other { background: var(--c-success); box-shadow: 0 4px 0 var(--c-success-dark); }
	.mini-bar { width: 70%; height: 5px; border-radius: 999px; background: var(--c-track); overflow: hidden; }
	.mini-bar span { display: block; height: 100%; background: var(--c-sky); }
</style>
