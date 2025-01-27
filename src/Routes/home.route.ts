import express from "express";
import {Guard} from "../Util/Guard.js";
import TenantService from "../Services/TenantService/tenant.service.js";
import StationService from "../Services/StationService/station.service.js"
import RenderingService from "../Services/SSRService/ssr.service.js";

function generatePastelColor(seed: string) {
	// Simple hash function to turn the seed string into a number
	function hashString(str: string) {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			hash = (hash << 5) - hash + str.charCodeAt(i);
			hash |= 0; // Convert to 32bit integer
		}
		return hash;
	}

	// Linear Congruential Generator for deterministic pseudo-random numbers
	function seededRandom(seed: number) {
		const modulus = 2 ** 31;
		const multiplier = 1103515245;
		const increment = 12345;
		seed = (seed * multiplier + increment) % modulus;
		return seed / modulus;
	}

	// Hash the seed string to get a starting value for the RNG
	let hashedSeed = hashString(seed);

	// Generate the pastel color using the seeded RNG
	const hue = Math.floor(seededRandom(hashedSeed++) * 360); // Random hue
	const saturation = 70 + seededRandom(hashedSeed++) * 20; // 70-90% saturation
	const lightness = 85 + seededRandom(hashedSeed++) * 10; // 85-95% lightness

	return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}


const router = express.Router();

router.get("/", async (req, res) => {

	const tenantService = TenantService.GetInstance();
	const stationService = StationService.GetInstance();
	const renderingService = RenderingService.GetInstance();

	const tenantId = await tenantService.GetTenantId(req);
	Guard.AgainstNullish(tenantId);

	const stationsMeta = await stationService.QueryStationsForTenant(tenantId);
	const meta = stationsMeta.map(e => Object({ImageColour: generatePastelColor(e.StationGuid), ...e}));
	const rendered = await renderingService.Render("pages/home", {stations: meta.reverse()});

	res.send(rendered);

});

export default router;