import express from "express";
import {Guard} from "../Util/Guard.js";
import TenantService from "../Services/TenantService/tenant.service.js";
import StationService from "../Services/StationService/station.service.js"
import RenderingService from "../Services/SSRService/ssr.service.js";

function generatePastelColor() {
	// Generate a pastel color using HSL
	const hue = Math.floor(Math.random() * 360); // Random hue
	const saturation = 70 + Math.random() * 20; // 70-90% saturation
	const lightness = 85 + Math.random() * 10; // 85-95% lightness
	return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

const router = express.Router();

router.get("/", async (req, res) => {

	const tenantService = TenantService.GetInstance();
	const stationService = StationService.GetInstance();
	const renderingService = RenderingService.GetInstance();

	const tenantId = await tenantService.GetTenantId(req);
	Guard.AgainstNullish(tenantId);

	const stationsMeta = await stationService.QueryStations(tenantId);
	const meta = stationsMeta.map(e => Object({ImageColour: generatePastelColor(), ...e}));
	const rendered = await renderingService.Render("pages/home", {stations: meta.reverse()});

	res.send(rendered);

});

export default router;