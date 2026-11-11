<script lang="ts">
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
