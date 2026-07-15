import { useEffect, useState } from "react";
import { Download, FileOutput, ScanSearch } from "lucide-react";

type AccessStatus = "readable" | "partial" | "blocked" | "unknown";
type MigrationPath =
	| "AUTO_SCAN"
	| "ASSISTED_IMPORT"
	| "MANUAL_IMPORT"
	| "NOT_CURRENTLY_FEASIBLE";

interface ScanReport {
	scannedAt: string;
	host: string;
	macosVersion: string;
	conclusion: string;
	permissionProbes: Array<{ label: string; status: string; detail: string }>;
	summary: Array<{
		inputMethod: string;
		detected: boolean;
		personalDataFound: string;
		readable: AccessStatus;
		value: string;
		migrationPath: MigrationPath;
	}>;
	results: Array<{
		id: string;
		name: string;
		detected: boolean;
		matchedPaths: string[];
		accessStatus: AccessStatus;
		potentialHabitData: string[];
		personalDataFound: string;
		migrationPath: MigrationPath;
		notes: string[];
		readableFiles: Array<{
			path: string;
			format: string;
			sizeBytes: number;
			readable: boolean;
			notes: string[];
			blockReasons: string[];
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
				guess: string;
			};
		}>;
	}>;
}

interface InstalledIme {
	id: string;
	name: string;
	detected: boolean;
	bundlePath: string | null;
	iconFallbackApp: string | null;
	migrationPath: MigrationPath;
	importHint: string;
}

interface ImportReport {
	importedAt: string;
	entryCount: number;
	bySource: Record<string, number>;
	sample: Array<{ surface: string; shortcut?: string; reading?: string; source: string; kind: string }>;
	notes: string[];
	warnings: string[];
}

const ACCESS_COLOR: Record<AccessStatus, string> = {
	readable: "text-emerald-600",
	partial: "text-amber-600",
	blocked: "text-red-600",
	unknown: "text-[#86868b]",
};

interface RimeExportReport {
	exportedAt: string;
	outDir: string;
	dictLines: number;
	customPhraseLines: number;
	files: string[];
	notes: string[];
	canceled?: boolean;
}

const MIGRATION_PRIORITY = [
	{ p: "P0", name: "搜狗", note: "官方 .bin 导出 → 本页「导出 Rime」" },
	{ p: "P1", name: "微信输入法", note: "无本地导出；跨设备词库/常用语同步" },
	{ p: "P1", name: "Apple", note: "Text Replacement（一键导入可读）" },
	{ p: "P2", name: "百度 / 讯飞", note: "份额高，待接 txt 适配器" },
] as const;

const MARKET_NOTE =
	"第三方输入法寡占：搜狗+讯飞+百度+微信 ≈ 84%（MobTech 2025）。详见 electron/input-habit-scanner/MIGRATION.md";

const MIGRATION_LABEL: Record<MigrationPath, string> = {
	AUTO_SCAN: "可自动扫描",
	ASSISTED_IMPORT: "辅助导入",
	MANUAL_IMPORT: "手动导入",
	NOT_CURRENTLY_FEASIBLE: "暂不可行",
};

function formatBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function InputHabitScannerPanel() {
	const [scanning, setScanning] = useState(false);
	const [importing, setImporting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [report, setReport] = useState<ScanReport | null>(null);
	const [importReport, setImportReport] = useState<ImportReport | null>(null);
	const [rimeExport, setRimeExport] = useState<RimeExportReport | null>(null);
	const [exportingRime, setExportingRime] = useState(false);
	const [showMigrationGuide, setShowMigrationGuide] = useState(false);
	const [installedImes, setInstalledImes] = useState<InstalledIme[]>([]);
	const [imeIcons, setImeIcons] = useState<Record<string, string | null>>({});
	const [loadingImes, setLoadingImes] = useState(true);
	const [expanded, setExpanded] = useState<string | null>(null);

	const loadInstalledImes = async () => {
		setLoadingImes(true);
		try {
			const list = (await window.fold.listInstalledInputMethods()) as unknown as InstalledIme[];
			setInstalledImes(list);
			const icons: Record<string, string | null> = {};
			await Promise.all(
				list.map(async (ime) => {
					icons[ime.id] = await window.fold.getAppIcon(
						ime.bundlePath ?? "",
						ime.iconFallbackApp ?? ime.name,
					);
				}),
			);
			setImeIcons(icons);
		} catch {
			/* ignore */
		} finally {
			setLoadingImes(false);
		}
	};

	useEffect(() => {
		void loadInstalledImes();
		void window.fold.getImportedInputHabits().then((data) => {
			if (data) setImportReport(data as unknown as ImportReport);
		});
	}, []);

	const runScan = async () => {
		setScanning(true);
		setError(null);
		try {
			const data = (await window.fold.scanInputHabits()) as unknown as ScanReport;
			setReport(data);
			setExpanded(null);
		} catch (err) {
			setError((err as Error).message ?? "扫描失败");
		} finally {
			setScanning(false);
		}
	};

	const runImport = async () => {
		setImporting(true);
		setError(null);
		try {
			const data = (await window.fold.importInputHabits()) as unknown as ImportReport;
			setImportReport(data);
		} catch (err) {
			setError((err as Error).message ?? "导入失败");
		} finally {
			setImporting(false);
		}
	};

	const runExportRime = async () => {
		setExportingRime(true);
		setError(null);
		try {
			const data = (await window.fold.exportInputHabitsRime()) as unknown as RimeExportReport;
			if (data.canceled) return;
			setRimeExport(data);
		} catch (err) {
			setError((err as Error).message ?? "导出失败");
		} finally {
			setExportingRime(false);
		}
	};

	return (
		<div className="space-y-3 rounded-lg border border-dashed border-black/12 bg-black/[0.02] p-3.5">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="text-[13px] font-medium text-[#1d1d1f]">Input Habit Scanner</p>
					<p className="mt-0.5 text-[11px] leading-relaxed text-[#86868b]">
						先检测本机输入法，再按需导入。脚本：{" "}
						<code className="text-[10px]">./scripts/import-input-habits.sh [搜狗.bin]</code>
					</p>
				</div>
				<div className="flex shrink-0 flex-col gap-1.5">
					<button
						type="button"
						onClick={() => void runExportRime()}
						disabled={exportingRime || scanning || importing}
						className="fold-home-save !px-3 !py-1.5 text-[12px]"
					>
						<span className="inline-flex items-center gap-1.5">
							<FileOutput className="size-3.5" aria-hidden />
							{exportingRime ? "导出中…" : "搜狗备份 → Rime"}
						</span>
					</button>
					<button
						type="button"
						onClick={() => void runImport()}
						disabled={importing || scanning || exportingRime}
						className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-[12px] text-[#1d1d1f]"
					>
						<span className="inline-flex items-center gap-1.5">
							<Download className="size-3.5" aria-hidden />
							{importing ? "导入中…" : "一键导入 PoC"}
						</span>
					</button>
					<button
						type="button"
						onClick={() => void runScan()}
						disabled={scanning || importing || exportingRime}
						className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-[12px] text-[#1d1d1f]"
					>
						<span className="inline-flex items-center gap-1.5">
							<ScanSearch className="size-3.5" aria-hidden />
							{scanning ? "扫描中…" : "扫描"}
						</span>
					</button>
				</div>
			</div>

			<button
				type="button"
				onClick={() => setShowMigrationGuide((v) => !v)}
				className="text-left text-[11px] text-[#007aff]"
			>
				{showMigrationGuide ? "收起" : "展开"}迁移路线图 · 市占率备忘
			</button>
			{showMigrationGuide && (
				<div className="space-y-2 rounded-lg border border-black/8 bg-white p-3 text-[11px] text-[#424245]">
					<p>{MARKET_NOTE}</p>
					<ul className="space-y-1">
						{MIGRATION_PRIORITY.map((row) => (
							<li key={row.name}>
								<strong>{row.p}</strong> {row.name} — {row.note}
							</li>
						))}
					</ul>
					<p className="text-[#86868b]">
						搜狗：偏好设置 → 词库 → 词库设置 → 导出。微信：设置 → 跨设备 → 个人词库/常用语同步（无 .bin）。
					</p>
				</div>
			)}

			{error && <p className="text-[11px] text-red-600">{error}</p>}

			<div>
				<div className="mb-2 flex items-center justify-between">
					<p className="text-[12px] font-medium text-[#1d1d1f]">本机输入法</p>
					<button
						type="button"
						onClick={() => void loadInstalledImes()}
						className="text-[10px] text-[#007aff]"
						disabled={loadingImes}
					>
						{loadingImes ? "检测中…" : "刷新"}
					</button>
				</div>
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
					{installedImes.map((ime) => (
						<div
							key={ime.id}
							className={`flex items-start gap-2 rounded-lg border p-2 ${
								ime.detected ? "border-black/10 bg-white" : "border-black/6 bg-black/[0.02] opacity-50"
							}`}
						>
							<div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/[0.04]">
								{imeIcons[ime.id] ? (
									<img src={imeIcons[ime.id]!} alt="" className="size-7 object-contain" />
								) : (
									<span className="text-[10px] font-medium text-[#86868b]">{ime.name.slice(0, 2)}</span>
								)}
							</div>
							<div className="min-w-0 flex-1">
								<p className="truncate text-[11px] font-medium text-[#1d1d1f]">{ime.name}</p>
								<p className={`text-[10px] ${ime.detected ? "text-emerald-600" : "text-[#86868b]"}`}>
									{ime.detected ? "已检测" : "未安装"}
								</p>
								{ime.detected && (
									<p className="mt-0.5 line-clamp-2 text-[9px] leading-snug text-[#86868b]">{ime.importHint}</p>
								)}
							</div>
						</div>
					))}
				</div>
			</div>

			{rimeExport && (
				<div className="space-y-2 rounded-lg border border-blue-200/80 bg-blue-50/50 p-3">
					<p className="text-[12px] font-medium text-blue-900">
						Rime 导出完成 · {rimeExport.dictLines} 词 · {rimeExport.customPhraseLines} 短语
					</p>
					<p className="font-mono text-[10px] break-all text-[#424245]">{rimeExport.outDir}</p>
					{rimeExport.notes.map((n) => (
						<p key={n} className="text-[10px] text-[#424245]">
							{n}
						</p>
					))}
					<p className="text-[10px] text-[#86868b]">
						复制到 ~/Library/Rime/ 后按 default.custom.yaml.snippet 合并并重新部署鼠须管。
					</p>
				</div>
			)}

			{importReport && (
				<div className="space-y-2 rounded-lg border border-emerald-200/80 bg-emerald-50/50 p-3">
					<p className="text-[12px] font-medium text-emerald-800">
						已导入 {importReport.entryCount} 条 ·{" "}
						{new Date(importReport.importedAt).toLocaleString()}
					</p>
					<p className="text-[11px] text-[#424245]">
						来源：{" "}
						{Object.entries(importReport.bySource)
							.map(([k, v]) => `${k} ${v}`)
							.join(" · ") || "无"}
					</p>
					{importReport.warnings.map((w) => (
						<p key={w} className="text-[10px] text-amber-700">
							{w}
						</p>
					))}
					{importReport.sample.length > 0 && (
						<pre className="max-h-32 overflow-auto rounded bg-white/80 p-2 text-[10px] leading-relaxed text-[#424245]">
							{importReport.sample
								.slice(0, 20)
								.map((e) =>
									e.shortcut
										? `${e.shortcut} → ${e.surface} (${e.source})`
										: `${e.surface}${e.reading ? ` [${e.reading}]` : ""} (${e.source})`,
								)
								.join("\n")}
						</pre>
					)}
				</div>
			)}

			{report && (
				<div className="space-y-4">
					<p className="text-[11px] text-[#86868b]">
						{report.host} · macOS {report.macosVersion} · {new Date(report.scannedAt).toLocaleString()}
					</p>

					<div>
						<p className="mb-2 text-[12px] font-medium text-[#1d1d1f]">Input Habit Migration Feasibility</p>
						<div className="overflow-x-auto rounded-lg border border-black/8">
							<table className="w-full min-w-[640px] text-left text-[11px]">
								<thead className="bg-black/[0.03] text-[#86868b]">
									<tr>
										<th className="px-2 py-1.5 font-medium">Input Method</th>
										<th className="px-2 py-1.5 font-medium">Detected</th>
										<th className="px-2 py-1.5 font-medium">Personal Data</th>
										<th className="px-2 py-1.5 font-medium">Readable</th>
										<th className="px-2 py-1.5 font-medium">Value</th>
										<th className="px-2 py-1.5 font-medium">Path</th>
									</tr>
								</thead>
								<tbody>
									{report.summary.map((row) => (
										<tr key={row.inputMethod} className="border-t border-black/6">
											<td className="px-2 py-1.5">{row.inputMethod}</td>
											<td className="px-2 py-1.5">{row.detected ? "YES" : "NO"}</td>
											<td className="px-2 py-1.5">{row.personalDataFound}</td>
											<td className={`px-2 py-1.5 uppercase ${ACCESS_COLOR[row.readable]}`}>
												{row.readable}
											</td>
											<td className="px-2 py-1.5">{row.value}</td>
											<td className="px-2 py-1.5">{MIGRATION_LABEL[row.migrationPath]}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>

					<div className="space-y-2">
						{report.results.map((ime) => (
							<div key={ime.id} className="rounded-lg border border-black/8 bg-white">
								<button
									type="button"
									className="flex w-full items-center justify-between px-3 py-2 text-left"
									onClick={() => setExpanded(expanded === ime.id ? null : ime.id)}
								>
									<span className="text-[12px] font-medium text-[#1d1d1f]">{ime.name}</span>
									<span className={`text-[11px] uppercase ${ACCESS_COLOR[ime.accessStatus]}`}>
										{ime.detected ? ime.accessStatus : "not installed"}
									</span>
								</button>
								{expanded === ime.id && (
									<div className="space-y-2 border-t border-black/6 px-3 py-2 text-[11px] text-[#424245]">
										<p>
											Paths: {ime.matchedPaths.length} · Files analyzed: {ime.readableFiles.length} ·{" "}
											{MIGRATION_LABEL[ime.migrationPath]}
										</p>
										{ime.notes.map((n) => (
											<p key={n} className="text-[#86868b]">
												{n}
											</p>
										))}
										{ime.matchedPaths.length > 0 && (
											<ul className="max-h-24 list-inside list-disc overflow-y-auto font-mono text-[10px]">
												{ime.matchedPaths.slice(0, 12).map((p) => (
													<li key={p}>{p}</li>
												))}
												{ime.matchedPaths.length > 12 && (
													<li>…+{ime.matchedPaths.length - 12} more</li>
												)}
											</ul>
										)}
										{ime.readableFiles.map((f) => (
											<div key={f.path} className="rounded border border-black/6 p-2">
												<p className="font-mono text-[10px] break-all">{f.path}</p>
												<p>
													{f.format} · {formatBytes(f.sizeBytes)} ·{" "}
													{f.readable ? "readable" : "blocked"}
													{f.blockReasons.length > 0 && ` (${f.blockReasons.join(", ")})`}
												</p>
												{f.tables?.map((t) => (
													<div key={t.name} className="mt-1">
														<p>
															Table <strong>{t.name}</strong> ({t.rowCount} rows) —{" "}
															{t.habitLike ? "habit-like" : "other"}
														</p>
														<p className="text-[#86868b]">Columns: {t.columns.join(", ")}</p>
														{t.samples && t.samples.length > 0 && (
															<pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap rounded bg-black/[0.03] p-1.5 text-[10px]">
																{t.samples.slice(0, 8).join("\n")}
															</pre>
														)}
													</div>
												))}
												{f.binaryInfo && (
													<p className="mt-1 text-[#86868b]">
														Binary: magic={f.binaryInfo.magicHex} entropy={f.binaryInfo.entropy}{" "}
														({f.binaryInfo.guess})
														{f.binaryInfo.stringSample.length > 0 &&
															` · strings: ${f.binaryInfo.stringSample.slice(0, 6).join(", ")}`}
													</p>
												)}
											</div>
										))}
									</div>
								)}
							</div>
						))}
					</div>

					<div>
						<p className="mb-1 text-[12px] font-medium text-[#1d1d1f]">权限探测</p>
						<ul className="space-y-1 text-[11px] text-[#424245]">
							{report.permissionProbes.map((p) => (
								<li key={p.label}>
									<strong>{p.label}</strong> [{p.status}]: {p.detail}
								</li>
							))}
						</ul>
					</div>

					<p className="rounded-lg bg-black/[0.03] p-2.5 text-[11px] leading-relaxed text-[#1d1d1f]">
						{report.conclusion}
					</p>
				</div>
			)}
		</div>
	);
}
