import { motion } from "framer-motion";

interface Step {
	id: string;
	label: string;
	status: string;
}

export function StepList({ steps }: { steps: Step[] }) {
	return (
		<ul className="space-y-1.5 text-sm">
			{steps.map((step) => (
				<motion.li
					key={step.id}
					initial={{ opacity: 0, x: -4 }}
					animate={{ opacity: 1, x: 0 }}
					className="flex items-center gap-2"
				>
					<span className="w-4 text-center">
						{step.status === "done" && <span className="text-emerald-400">✓</span>}
						{step.status === "running" && (
							<span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
						)}
						{step.status === "pending" && <span className="text-white/30">○</span>}
						{step.status === "failed" && <span className="text-red-400">✗</span>}
					</span>
					<span className={step.status === "running" ? "text-white" : "text-white/70"}>
						{step.label}
					</span>
				</motion.li>
			))}
		</ul>
	);
}
