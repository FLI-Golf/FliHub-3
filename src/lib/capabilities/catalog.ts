/**
 * Typed access to the FliHub capability catalog.
 *
 * The catalog data lives in `catalog.json`, which is ALSO loaded by the
 * PocketBase hooks (`pocketbase/pb_hooks/flihub_capabilities.pb.js`) via a
 * relative JSON require — one source of truth, no forked lists. Edit the
 * JSON; both sides stay consistent.
 */
import raw from './catalog.json';

export type CapabilityAvailability = 'planned' | 'upcoming';
// No capability is "available" yet in Phase 1B — available means the software
// workflow exists, which is honestly not the case for any catalog entry yet.

export type TemplateId = 'league' | 'race-event' | 'custom';

export interface RaceDistance {
	/** 'marathon' | 'half-marathon' for catalog presets, 'custom' otherwise. */
	key: string;
	label: string;
	distance: number;
	unit: 'km' | 'mi';
}

export interface CapabilityDefinition {
	id: string;
	label: string;
	description: string;
	availability: CapabilityAvailability;
	milestone: string;
	dependsOn: string[];
}

export interface TemplateDefinition {
	id: TemplateId;
	label: string;
	description: string;
	defaultCapabilities: string[];
	defaultRaceDistances?: RaceDistance[];
}

interface CatalogShape {
	templates: TemplateDefinition[];
	capabilities: CapabilityDefinition[];
}

export const catalog = raw as unknown as CatalogShape;

export const templates: TemplateDefinition[] = catalog.templates;
export const capabilityDefinitions: CapabilityDefinition[] = catalog.capabilities;

const byId = new Map(capabilityDefinitions.map((c) => [c.id, c]));

export function getCapability(id: string): CapabilityDefinition | null {
	return byId.get(id) ?? null;
}

export function getTemplate(id: string): TemplateDefinition | null {
	return templates.find((t) => t.id === id) ?? null;
}

/**
 * Returns the selection closed under dependencies (missing dependencies added),
 * in catalog order. Pure helper shared by the onboarding UI and tests; the
 * authoritative enforcement happens again server-side in the hook.
 */
export function withDependencies(selected: string[]): string[] {
	const chosen = new Set(selected.filter((id) => byId.has(id)));
	let changed = true;
	while (changed) {
		changed = false;
		for (const id of chosen) {
			for (const dep of byId.get(id)?.dependsOn ?? []) {
				if (!chosen.has(dep)) {
					chosen.add(dep);
					changed = true;
				}
			}
		}
	}
	return capabilityDefinitions.filter((c) => chosen.has(c.id)).map((c) => c.id);
}

/** Missing dependencies for a selection (for UI hints). */
export function missingDependencies(selected: string[]): string[] {
	return withDependencies(selected).filter((id) => !selected.includes(id));
}

export const availabilityMeta: Record<
	CapabilityAvailability,
	{ label: string; badgeClass: string }
> = {
	planned: { label: 'Planned', badgeClass: 'border-transparent bg-blue-600 text-white' },
	upcoming: { label: 'Upcoming', badgeClass: 'border-transparent bg-amber-500 text-white' }
};
