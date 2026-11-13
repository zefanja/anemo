<script lang="ts">
	import TIcon, { type TIconName } from '$lib/components/teacher/TIcon.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let initials = $derived((data.teacherEmail ?? '').replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase() || 'L');

	type Item = { href: string; label: string; icon: TIconName; desc: string };
	const content: Item[] = [
		{ href: '/teacher/tasks/import', label: 'Aufgaben importieren', icon: 'upload', desc: 'Eigene Aufgaben per YAML/JSON hochladen' },
		{ href: '/teacher/atoms/import', label: 'Erklärungen', icon: 'book', desc: 'Erklärtexte für Atome importieren' },
		{ href: '/teacher/atoms/insights', label: 'Atom-Insights', icon: 'chart', desc: 'Wie gut läuft jedes Atom?' }
	];
	let account = $derived<Item[]>([
		{ href: '/teacher/settings', label: 'Einstellungen', icon: 'settings', desc: 'Konto und Passwort' },
		...(data.isAdmin
			? [{ href: '/teacher/admin/teachers', label: 'Lehrerverwaltung', icon: 'shield' as TIconName, desc: 'Lehrkräfte anlegen und verwalten' }]
			: [])
	]);
</script>

<svelte:head><title>Anemo – Mehr</title></svelte:head>

<div class="page">
	<div class="profile">
		<span class="big-avatar" aria-hidden="true">{initials}</span>
		<div class="profile-text">
			<h1 class="page-title">Mein Bereich</h1>
			<span class="page-sub">{data.teacherEmail}{data.isAdmin ? ' · Admin' : ''}</span>
		</div>
	</div>

	{#snippet group(title: string, items: Item[])}
		<section class="group">
			<h2 class="group-title">{title}</h2>
			<ul class="card list">
				{#each items as it}
					<li>
						<a href={it.href} class="row">
							<span class="ic"><TIcon name={it.icon} /></span>
							<span class="txt"><b>{it.label}</b><span>{it.desc}</span></span>
							<TIcon name="chevron" size={18} />
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/snippet}

	{@render group('Inhalte', content)}
	{@render group('Konto', account)}

	<a href="/logout" class="btn btn-outline btn-full logout"><TIcon name="logout" size={18} />Abmelden</a>
</div>

<style>
	.profile { display: flex; align-items: center; gap: 0.9rem; }
	.profile-text { display: flex; flex-direction: column; min-width: 0; }
	.profile-text .page-sub { overflow: hidden; text-overflow: ellipsis; }
	.big-avatar {
		width: 3.5rem; height: 3.5rem; flex: none; border-radius: 50%;
		background: var(--c-sky); color: var(--c-navy);
		display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 1.25rem;
	}
	.group { display: flex; flex-direction: column; gap: 0.5rem; }
	.group-title { font-size: 0.75rem; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; color: var(--c-ink-2); margin: 0 0.25rem; }
	.list { list-style: none; padding: 0; overflow: hidden; }
	.list li + li { border-top: 1px solid var(--c-track); }
	.row {
		display: flex; align-items: center; gap: 0.875rem; min-height: 3.75rem; padding: 0.6rem 1rem;
		text-decoration: none; color: var(--c-ink-2);
	}
	.row:hover { background: #f8fbfe; }
	.ic {
		width: 2.4rem; height: 2.4rem; flex: none; border-radius: 12px;
		background: var(--c-primary-light); color: var(--c-primary-dark);
		display: flex; align-items: center; justify-content: center;
	}
	.txt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
	.txt b { color: var(--c-navy); font-weight: 800; font-size: 1rem; }
	.txt span { font-size: 0.8rem; font-weight: 700; }
	.logout { min-height: 3.25rem; margin-top: 0.5rem; }
	@media (min-width: 900px) { .page { max-width: 640px; } }
</style>
