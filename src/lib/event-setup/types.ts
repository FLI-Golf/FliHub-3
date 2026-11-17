export interface SetupSeason {
	id: string;
	name: string;
	status: string;
	startsOn: string | null;
	endsOn: string | null;
}
export interface SetupCourse {
	id: string;
	name: string;
	holeIds: string[];
	labels: { label: string; total: number; missing: number[] }[];
}
export interface SetupEntry {
	id: string;
	season: string;
	teamName: string;
	status: string;
	teamActive: boolean;
}
export interface SetupRoster {
	entry: string;
	athlete: string;
	athleteName: string;
	status: string;
	athleteActive: boolean;
}
export interface SetupMember {
	userId: string;
	name: string;
	role: string;
}
export interface SetupRound {
	teeStartLocal?: string;
	teeStartsAt?: string;
	name: string;
	course: string;
	position: string;
	holeIds: string[];
}
export interface SetupGroup {
	name: string;
	scorekeeper: string;
	entries: { entry: string; athletes: string[] }[];
}
export interface GuidedEventInput {
	teeTimeZone?: string;
	teeIntervalMinutes?: number;
	multiDay?: boolean;
	endDate?: string;
	venueName?: string;
	venueAddress?: string;
	version: 1;
	name: string;
	season: string;
	date: string;
	rounds: SetupRound[];
	groups: SetupGroup[];
}
