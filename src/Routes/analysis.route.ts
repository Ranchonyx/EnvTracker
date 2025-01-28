import express from "express";
import RenderingService from "../Services/SSRService/ssr.service.js";
import TenantService from "../Services/TenantService/tenant.service.js";
import {Guard} from "../Util/Guard.js";
import {GetBuildNumber} from "../Util/MeasurementUtil.js";

const router = express.Router();

router.get("/:station_id", async (req, res) => {
	const renderingService = RenderingService.GetInstance();
	const tenantService = TenantService.GetInstance();
	const tenantId = await tenantService.GetTenantId(req);
	Guard.AgainstNullish(tenantId);

	const opts = {
		buildNumber: GetBuildNumber(),
		login: await tenantService.GetTenantName(tenantId)
	}

	const rendered = await renderingService.Render("pages/analysis", opts);

	res.send(rendered);
});

export default router;