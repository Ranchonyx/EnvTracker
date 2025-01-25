import express from "express";
import RenderingService from "../Services/SSRService/ssr.service.js";

const router = express.Router();

router.get("/:station_id", async (req, res) => {
	const renderingService = RenderingService.GetInstance();

	const rendered = await renderingService.Render("pages/viz", {});

	res.send(rendered);
});

export default router;