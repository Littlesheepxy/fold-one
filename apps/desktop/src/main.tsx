import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { OverlayApp } from "./overlay/OverlayApp";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<OverlayApp />
	</StrictMode>,
);
