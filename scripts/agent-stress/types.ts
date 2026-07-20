export type Check = {
	name: string;
	pass: boolean;
	detail?: string;
};

export type TurnResult = {
	label: string;
	status?: string;
	checks: Check[];
	skipped?: string;
};

export type ScenarioCtx = {
	/** Isolated Fold data dir for this scenario (shared across turns). */
	dataDir: string;
	/** Isolated fake $HOME (with Downloads/) for finder skills. */
	homeDir: string;
	/** Root report dir for this run. */
	reportDir: string;
	log: (line: string) => void;
};

export type Scenario = {
	id: string;
	name: string;
	run: (ctx: ScenarioCtx) => Promise<TurnResult[]>;
};

export function check(name: string, pass: boolean, detail?: string): Check {
	return { name, pass, detail: detail?.slice(0, 240) };
}

export function allPass(checks: Check[]): boolean {
	return checks.every((c) => c.pass);
}
