<script lang="ts">
	import { goto } from '$app/navigation';
	import Icon from '$lib/components/student/Icon.svelte';
	import { levelProgress } from '$lib/gamification.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let showConfirm = $state(false);
	let resetting = $state(false);
	let resetError = $state(false);

	const level = $derived(levelProgress(data.xp, data.level));
	const initial = $derived((data.studentName ?? '?').trim().charAt(0).toUpperCase());

	async function resetProgress() {
		resetting = true;
		resetError = false;
		try {
			const res = await fetch('/api/reset-progress', { method: 'POST' });
			if (!res.ok) throw new Error();
			goto('/placement');
		} catch {
			resetting = false;
			resetError = true;
		}
	}
</script>

<svelte:head><title>Anemo – Ich</title></svelte:head>

<div class="page">
	<section class="profile">
		<span class="avatar" aria-hidden="true">{initial}</span>
		<div>
			<h1>{data.studentName}</h1>
			<p>Level {data.level} · {data.xp.toLocaleString('de-DE')} XP</p>
		</div>
	</section>

	<div class="tiles">
		<div class="tile">
			<Icon name="flame" size={22} color="var(--c-orange)" />
			<strong>{data.streakDays}</strong>
			<span>Tage Streak</span>
		</div>
		<div class="tile">
			<Icon name="shield" size={22} color="var(--c-primary)" />
			<strong>{data.streakFreezes}</strong>
			<span>Streak-Schutz</span>
		</div>
		<div class="tile">
			<Icon name="medal" size={22} color="var(--c-gold)" />
			<strong>{data.badges.length}</strong>
			<span>Abzeichen</span>
		</div>
	</div>

	<section class="card">
		<div class="row-top">
			<strong>Bis Level {data.level + 1}</strong>
			<span>{level.nextLevelXp ? `${level.remaining.toLocaleString('de-DE')} XP` : 'Max'}</span>
		</div>
		<div class="bar"><span style="width: {level.pct}%"></span></div>
	</section>

	<section class="card info">
		<h2>So funktioniert’s</h2>
		<ul>
			<li><Icon name="target" size={18} color="var(--c-success)" /> <span><strong>Tagesziel:</strong> Sammle jeden Tag {data.dailyGoal} XP.</span></li>
			<li><Icon name="bolt" size={18} color="var(--c-orange)" /> <span><strong>Combo:</strong> Ab 3 richtigen Antworten in Folge gibt es Bonus-XP.</span></li>
			<li><Icon name="shield" size={18} color="var(--c-primary)" /> <span><strong>Streak-Schutz:</strong> Rettet deine Serie, wenn du einmal einen Tag verpasst. Alle 7 Tage bekommst du einen neuen (höchstens 2).</span></li>
			<li><Icon name="sparkle" size={18} color="var(--c-gold)" /> <span><strong>Sterne:</strong> Jedes gemeisterte Thema leuchtet auf deiner Sternenkarte.</span></li>
		</ul>
	</section>

	<a href="/logout" class="logout">
		<Icon name="logout" size={20} />
		Abmelden
	</a>

	<div class="reset">
		{#if !showConfirm}
			<button class="reset-btn" onclick={() => (showConfirm = true)}>Lernfortschritt zurücksetzen</button>
		{:else}
			<div class="confirm" role="alertdialog" aria-label="Zurücksetzen bestätigen">
				<p>Wirklich alles zurücksetzen? XP, Abzeichen und Lernfortschritt werden gelöscht und der Einstufungstest startet neu.</p>
				{#if resetError}<p class="error">Das hat nicht geklappt. Bitte versuche es erneut.</p>{/if}
				<div class="confirm-actions">
					<button class="cancel" onclick={() => (showConfirm = false)} disabled={resetting}>Abbrechen</button>
					<button class="danger" onclick={resetProgress} disabled={resetting}>
						{resetting ? 'Wird zurückgesetzt…' : 'Ja, zurücksetzen'}
					</button>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.page { max-width: 640px; margin: 0 auto; padding: 1.4rem 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
	.profile { display: flex; align-items: center; gap: 0.9rem; }
	.avatar {
		width: 4rem; height: 4rem; flex: none; border-radius: 50%;
		background: var(--c-sky); color: var(--c-navy);
		display: flex; align-items: center; justify-content: center;
		font-size: 1.75rem; font-weight: 900;
	}
	h1 { font-size: 1.5rem; font-weight: 900; }
	.profile p { font-weight: 800; color: var(--c-ink-2); }
	.tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.6rem; }
	.tile {
		background: #fff; border-radius: 18px; padding: 0.8rem 0.4rem;
		display: flex; flex-direction: column; align-items: center; gap: 0.15rem; box-shadow: var(--shadow-sm);
	}
	.tile strong { font-size: 1.35rem; font-weight: 900; }
	.tile span { font-size: 0.75rem; font-weight: 800; color: var(--c-ink-2); }
	.card { background: #fff; border-radius: 20px; padding: 1rem; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; gap: 0.6rem; }
	.row-top { display: flex; justify-content: space-between; font-weight: 800; }
	.row-top span { color: var(--c-ink-2); }
	h2 { font-size: 1.05rem; font-weight: 900; }
	.info ul { list-style: none; display: flex; flex-direction: column; gap: 0.6rem; }
	.info li { display: flex; gap: 0.6rem; align-items: flex-start; font-size: 0.925rem; font-weight: 600; color: #34507a; }
	.info li strong { color: var(--c-navy); }
	.logout {
		display: flex; align-items: center; justify-content: center; gap: 0.5rem;
		min-height: 3.25rem; border-radius: 1rem; background: #fff; border: 2px solid var(--c-line);
		color: var(--c-navy); font-weight: 900; text-decoration: none;
	}
	.logout:hover { border-color: var(--c-primary); }
	.reset-btn {
		width: 100%; min-height: 2.75rem; background: none; border: 0;
		color: var(--c-ink-2); font: 700 0.875rem var(--font); text-decoration: underline; cursor: pointer;
	}
	.confirm { background: var(--c-error-light); border: 1px solid #fecaca; border-radius: 16px; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
	.confirm p { font-size: 0.9rem; font-weight: 700; color: #7f1d1d; }
	.confirm .error { color: #b91c1c; }
	.confirm-actions { display: flex; gap: 0.5rem; }
	.confirm-actions button { flex: 1; min-height: 2.75rem; border-radius: 12px; font: 800 0.95rem var(--font); cursor: pointer; }
	.cancel { background: #fff; border: 1px solid var(--c-line); color: var(--c-navy); }
	.danger { background: #b91c1c; border: 0; color: #fff; }
	button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
