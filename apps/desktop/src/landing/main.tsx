import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LandingApp } from "./LandingApp";
import "./landing.css";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<LandingApp />
	</StrictMode>,
);
