<script lang="ts">
	import { Archive, ArchiveRestore, CircleAlert, Flag, MapPin, Plus } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	interface Course {
		id: string;
		name: string;
		status: 'active' | 'archived';
	}
	interface Hole {
		id: string;
		course: string;
		number: number;
		name: string;
		par: number;
		status: 'active' | 'archived';
	}
	interface Position {
		id: string;
		hole: string;
		label: string;
		distance: number;
		unit: string;
		status: 'active' | 'archived';
	}

	interface Props {
		courses: Course[];
		holes: Hole[];
		positions: Position[];
		canManage: boolean;
		myRole: string;
		/** SvelteKit ActionData from the page's form actions (shape varies by action). */
		form: unknown;
	}

	let { courses, holes, positions, canManage, myRole, form }: Props = $props();

	const holesOf = (courseId: string) =>
		holes.filter((h) => h.course === courseId && h.status === 'active');
	const positionsOf = (holeId: string) =>
		positions.filter((p) => p.hole === holeId && p.status === 'active');

	const formRecord = $derived(
		form && typeof form === 'object' ? (form as Record<string, unknown>) : null
	);
	const message = $derived(
		formRecord && 'message' in formRecord ? String(formRecord.message) : null
	);
</script>

<div class="flex flex-col gap-6">
	{#if message}
		<Alert.Root variant="destructive">
			<CircleAlert class="size-4" />
			<Alert.Title>Action failed</Alert.Title>
			<Alert.Description>{message}</Alert.Description>
		</Alert.Root>
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title class="flex items-center gap-2">
				<MapPin class="size-5" />
				Courses ({courses.length})
			</Card.Title>
			<Card.Description>
				Course layouts with numbered, named holes and labeled positions (distance with an explicit
				unit). Venue records (physical locations) are planned, not implemented. Demo numbers — nine
				holes, par 3, the 220–425 ft range — are pilot configuration, not limits imposed here.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-3">
			{#if courses.length === 0}
				<p class="text-sm text-muted-foreground">No courses yet.</p>
			{/if}
			{#each courses as course (course.id)}
				<div
					class="flex flex-col gap-2 rounded-md border p-3 {course.status === 'archived'
						? 'opacity-60'
						: ''}"
				>
					<div class="flex flex-wrap items-center justify-between gap-2">
						<div class="flex items-center gap-2">
							<span class="font-medium">{course.name}</span>
							{#if course.status === 'archived'}
								<Badge variant="secondary">Archived</Badge>
							{/if}
						</div>
						{#if canManage}
							{#if course.status === 'active'}
								<form method="POST" action="?/archiveCourse">
									<input type="hidden" name="course" value={course.id} />
									<Button variant="ghost" size="sm" type="submit">
										<Archive class="mr-1 size-3.5" /> Archive course
									</Button>
								</form>
							{:else}
								<form method="POST" action="?/unarchiveCourse">
									<input type="hidden" name="course" value={course.id} />
									<Button variant="ghost" size="sm" type="submit">
										<ArchiveRestore class="mr-1 size-3.5" /> Restore course
									</Button>
								</form>
							{/if}
						{/if}
					</div>

					{#if course.status === 'active'}
						{#if holesOf(course.id).length === 0}
							<p class="text-sm text-muted-foreground">No holes on this course yet.</p>
						{/if}
						{#each holesOf(course.id) as hole (hole.id)}
							<div class="flex flex-col gap-1.5 rounded-md border p-2 pl-3">
								<div class="flex flex-wrap items-center justify-between gap-2">
									<div class="flex items-center gap-2 text-sm">
										<Flag class="size-3.5" />
										<span class="font-medium">Hole {hole.number} — {hole.name}</span>
										<Badge variant="outline">Par {hole.par}</Badge>
									</div>
									{#if canManage}
										<form method="POST" action="?/archiveHole">
											<input type="hidden" name="hole" value={hole.id} />
											<Button variant="ghost" size="sm" type="submit">Remove</Button>
										</form>
									{/if}
								</div>
								<div class="flex flex-wrap items-center gap-2 pl-6 text-sm">
									{#each positionsOf(hole.id) as position (position.id)}
										<span class="flex items-center gap-1 rounded-md border px-2 py-0.5">
											<Badge variant="secondary">{position.label}</Badge>
											{position.distance}
											{position.unit}
											{#if canManage}
												<form method="POST" action="?/archivePosition" class="inline">
													<input type="hidden" name="position" value={position.id} />
													<button
														type="submit"
														class="ml-1 text-muted-foreground hover:text-foreground"
														aria-label="Remove {position.label} position"
													>
														×
													</button>
												</form>
											{/if}
										</span>
									{/each}
									{#if positionsOf(hole.id).length === 0}
										<span class="text-muted-foreground">No positions yet.</span>
									{/if}
								</div>
								{#if canManage}
									<form
										method="POST"
										action="?/addPosition"
										class="flex flex-wrap items-end gap-2 pl-6"
									>
										<input type="hidden" name="hole" value={hole.id} />
										<div class="flex w-28 flex-col gap-1">
											<Label for="pos-label-{hole.id}" class="text-xs">Position</Label>
											<Input
												id="pos-label-{hole.id}"
												name="label"
												required
												maxlength={40}
												placeholder="red"
												class="h-8"
											/>
										</div>
										<div class="flex w-28 flex-col gap-1">
											<Label for="pos-distance-{hole.id}" class="text-xs">Distance</Label>
											<Input
												id="pos-distance-{hole.id}"
												name="distance"
												type="number"
												min="1"
												step="any"
												required
												class="h-8"
											/>
										</div>
										<div class="flex w-28 flex-col gap-1">
											<Label for="pos-unit-{hole.id}" class="text-xs">Unit</Label>
											<select
												id="pos-unit-{hole.id}"
												name="unit"
												required
												class="h-8 rounded-md border bg-background px-2 text-sm"
											>
												<option value="feet" selected>feet</option>
												<option value="meters">meters</option>
												<option value="yards">yards</option>
											</select>
										</div>
										<Button variant="outline" size="sm" type="submit">
											<Plus class="mr-1 size-3.5" /> Add position
										</Button>
									</form>
								{/if}
							</div>
						{/each}

						{#if canManage}
							<form
								method="POST"
								action="?/addHole"
								class="flex flex-wrap items-end gap-2 border-t pt-3"
							>
								<input type="hidden" name="course" value={course.id} />
								<div class="flex w-24 flex-col gap-1">
									<Label for="hole-number-{course.id}" class="text-xs">Hole #</Label>
									<Input
										id="hole-number-{course.id}"
										name="number"
										type="number"
										min="1"
										step="1"
										required
										class="h-8"
									/>
								</div>
								<div class="flex min-w-40 flex-1 flex-col gap-1">
									<Label for="hole-name-{course.id}" class="text-xs">Hole name</Label>
									<Input
										id="hole-name-{course.id}"
										name="name"
										required
										maxlength={120}
										class="h-8"
									/>
								</div>
								<div class="flex w-24 flex-col gap-1">
									<Label for="hole-par-{course.id}" class="text-xs">Par</Label>
									<Input
										id="hole-par-{course.id}"
										name="par"
										type="number"
										min="1"
										step="1"
										value="3"
										required
										class="h-8"
									/>
								</div>
								<Button variant="outline" size="sm" type="submit">
									<Plus class="mr-1 size-3.5" /> Add hole
								</Button>
							</form>
						{/if}
					{/if}
				</div>
			{/each}

			{#if canManage}
				<form
					method="POST"
					action="?/createCourse"
					class="flex flex-wrap items-end gap-3 border-t pt-4"
				>
					<div class="flex min-w-48 flex-1 flex-col gap-1.5">
						<Label for="course-name">New course</Label>
						<Input
							id="course-name"
							name="name"
							required
							maxlength={120}
							placeholder="Course name"
						/>
					</div>
					<Button type="submit">
						<Plus class="mr-1 size-4" /> Create course
					</Button>
				</form>
			{:else}
				<p class="text-sm text-muted-foreground">
					Your role ({myRole}) can view course layouts but not manage them.
				</p>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
