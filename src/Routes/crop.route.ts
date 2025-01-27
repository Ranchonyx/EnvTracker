import express from "express";
import {Measurement, QueryStationStatusResponse} from "../WebUI/DBResponses.js";
import Service from "../Services/CropService/crop.service.js";

const router = express.Router();

router.post("/:station_id/recommendCrops", async (req, res) => {
	const brief: QueryStationStatusResponse = req.body;
	const cropService = Service.GetInstance();

	const recommendedCrops = cropService.RecommendCropsFor({
		temperature: parseFloat(brief.Temperature+""),
		humidity: parseFloat(brief.Humidity+""),
		pressure: parseFloat(brief.Pressure+"")
	});

	res.send(recommendedCrops);
});

export default router;