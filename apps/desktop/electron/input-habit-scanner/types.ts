export type HabitDataType =
	| "text_replacement"
	| "user_dictionary"
	| "user_lexicon"
	| "phrase_shortcut"
	| "frequency_data"
	| "learning_data"
	| "candidate_weights"
	| "custom_phrases"
	| "leveldb_store"
	| "unknown_personal_data";

export type FileFormat =
	| "sqlite"
	| "plist"
	| "json"
	| "yaml"
	| "leveldb"
	| "text"
	| "binary"
	| "unknown";

export type AccessStatus = "readable" | "partial" | "blocked" | "unknown";

export type BlockReason =
	| "macos_sandbox"
	| "tcc"
	| "container_isolation"
	| "file_permission"
	| "encrypted"
	| "proprietary_format"
	| "cloud_only"
	| "not_located";

export type MigrationPath =
	| "AUTO_SCAN"
	| "ASSISTED_IMPORT"
	| "MANUAL_IMPORT"
	| "NOT_CURRENTLY_FEASIBLE";

export type ValueRating = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

export interface ScannedFile {
	path: string;
	format: FileFormat;
	sizeBytes: number;
	readable: boolean;
	blockReasons: BlockReason[];
	notes: string[];
	tables?: Array<{
		name: string;
		columns: string[];
		rowCount: number;
		habitLike: boolean;
		samples?: string[];
	}>;
	binaryInfo?: {
		magicHex: string;
		entropy: number;
		stringSample: string[];
		guess: "encrypted" | "compressed" | "protobuf-like" | "custom_binary" | "unknown";
	};
}

export interface InputMethodScanResult {
	id: string;
	name: string;
	detected: boolean;
	matchedPaths: string[];
	readableFiles: ScannedFile[];
	potentialHabitData: HabitDataType[];
	accessStatus: AccessStatus;
	notes: string[];
	migrationPath: MigrationPath;
	valueRating: ValueRating;
	personalDataFound: string;
}

export interface PermissionProbe {
	label: string;
	status: "ok" | "partial" | "blocked" | "unknown";
	detail: string;
}

export interface InputHabitScanReport {
	scannedAt: string;
	host: string;
	macosVersion: string;
	permissionProbes: PermissionProbe[];
	results: InputMethodScanResult[];
	summary: Array<{
		inputMethod: string;
		detected: boolean;
		personalDataFound: string;
		readable: AccessStatus;
		value: ValueRating;
		migrationPath: MigrationPath;
	}>;
	conclusion: string;
}

export type LexiconEntryKind = "text_replacement" | "phrase" | "word" | "hot_word";

export interface PersonalLexiconEntry {
	surface: string;
	reading?: string;
	shortcut?: string;
	source: string;
	kind: LexiconEntryKind;
}

export interface InputHabitImportReport {
	importedAt: string;
	mode: "one_click_poc";
	entryCount: number;
	bySource: Record<string, number>;
	entries: PersonalLexiconEntry[];
	sample: PersonalLexiconEntry[];
	notes: string[];
	warnings: string[];
}

export interface InstalledImeInfo {
	id: string;
	name: string;
	detected: boolean;
	bundlePath: string | null;
	/** ponytail: when no .app bundle, resolve icon via KNOWN_APP_PATHS */
	iconFallbackApp: string | null;
	migrationPath: MigrationPath;
	importHint: string;
}
