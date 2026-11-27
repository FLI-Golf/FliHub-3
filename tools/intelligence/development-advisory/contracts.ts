/**
 * Offline development advisory contracts.
 *
 * These contracts describe advisory information only.
 * They do not authorize disclosure, provider dispatch,
 * execution, verification or completion acceptance.
 */

export const ADVISORY_VERSION = 1 as const;

export const ADVISORY_LIMITS = Object.freeze({
	objectiveBytes: 1200,
	summaryBytes: 512,
	repositoryFacts: 8,
	documentationReferences: 8,
	evidenceSummaries: 8,
	requestBytes: 16 * 1024,
	responseBytes: 4 * 1024
});

export const ROADMAP_OBJECTIVES = Object.freeze(['adm-3-assignment-review-export'] as const);

export type RoadmapObjectiveId = (typeof ROADMAP_OBJECTIVES)[number];

export type AdvisoryObjective =
	| {
			kind: 'roadmap';
			id: RoadmapObjectiveId;
	  }
	| {
			kind: 'custom';
			summary: string;
	  };

export const REPOSITORY_FACT_KINDS = Object.freeze([
	'starting-checkpoint',
	'current-checkpoint',
	'working-tree',
	'tracking-relationship'
] as const);

export type RepositoryFact =
	| {
			kind: 'starting-checkpoint' | 'current-checkpoint';
			value: string;
	  }
	| {
			kind: 'working-tree';
			value: 'clean' | 'modified' | 'unknown';
	  }
	| {
			kind: 'tracking-relationship';
			value: 'synchronized' | 'ahead' | 'behind' | 'diverged' | 'unknown';
	  };

export const DOCUMENTATION_IDS = Object.freeze([
	'intelligence-architecture',
	'intelligence-roadmap',
	'repository-instructions'
] as const);

export type DocumentationId = (typeof DOCUMENTATION_IDS)[number];

export type DocumentationReference = {
	id: DocumentationId;
	section: string;
};

export const EVIDENCE_PROVENANCE = Object.freeze([
	'operator-selected-summary',
	'independent-observation-summary',
	'worker-reported-unverified'
] as const);

export type EvidenceProvenance = (typeof EVIDENCE_PROVENANCE)[number];

/**
 * Provenance is a supplied classification, not an attestation.
 * Structural validation cannot authenticate an observation.
 */
export type EvidenceSummary = {
	provenance: EvidenceProvenance;
	summary: string;
};

export const PLANNING_RECOMMENDATIONS = Object.freeze([
	'clarify-objective',
	'review-documentation',
	'review-prerequisites',
	'review-proposed-scope',
	'prepare-assignment-for-human-review'
] as const);

export const EVIDENCE_RECOMMENDATIONS = Object.freeze([
	'request-missing-evidence',
	'review-reported-discrepancies',
	'request-independent-verification',
	'review-evidence-provenance',
	'continue-human-evidence-review'
] as const);

export type PlanningRecommendation = (typeof PLANNING_RECOMMENDATIONS)[number];

export type EvidenceRecommendation = (typeof EVIDENCE_RECOMMENDATIONS)[number];

export type AdvisoryRecommendation = PlanningRecommendation | EvidenceRecommendation;

export type AdvisoryKind = 'planning' | 'evidence-assessment';

export type SelectedAdvisoryContext = {
	objective: AdvisoryObjective;
	repositoryFacts: readonly RepositoryFact[];
	documentationReferences: readonly DocumentationReference[];
};

export type PlanningAdvisoryRequest = {
	version: typeof ADVISORY_VERSION;
	kind: 'planning';
	context: SelectedAdvisoryContext;
	requestedRecommendation: 'next-planning-step';
};

export type EvidenceAdvisoryRequest = {
	version: typeof ADVISORY_VERSION;
	kind: 'evidence-assessment';
	context: SelectedAdvisoryContext;
	evidenceSummaries: readonly EvidenceSummary[];
	requestedRecommendation: 'next-evidence-review-step';
};

export type DevelopmentAdvisoryRequest = PlanningAdvisoryRequest | EvidenceAdvisoryRequest;

export const ABSTENTION_REASONS = Object.freeze([
	'insufficient-context',
	'ambiguous-context',
	'no-compatible-recommendation',
	'confidence-missing',
	'confidence-below-threshold',
	'explicit'
] as const);

export const UNAVAILABLE_REASONS = Object.freeze([
	'disabled',
	'invalid-request',
	'invalid-response',
	'provider-unavailable',
	'timeout'
] as const);

export type AbstentionReason = (typeof ABSTENTION_REASONS)[number];

export type UnavailableReason = (typeof UNAVAILABLE_REASONS)[number];

type AdvisoryRecommendationOutcome =
	| {
			version: typeof ADVISORY_VERSION;
			kind: 'planning';
			status: 'recommendation';
			recommendation: PlanningRecommendation;
			confidence: number | null;
	  }
	| {
			version: typeof ADVISORY_VERSION;
			kind: 'evidence-assessment';
			status: 'recommendation';
			recommendation: EvidenceRecommendation;
			confidence: number | null;
	  };

export type DevelopmentAdvisoryOutcome =
	| AdvisoryRecommendationOutcome
	| {
			version: typeof ADVISORY_VERSION;
			kind: AdvisoryKind;
			status: 'abstention';
			reason: AbstentionReason;
	  }
	| {
			version: typeof ADVISORY_VERSION;
			kind: AdvisoryKind;
			status: 'unavailable';
			reason: UnavailableReason;
	  };
