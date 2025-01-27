import express from "express";
import {Measurement, QueryStationStatusResponse} from "../WebUI/DBResponses.js";
import Service from "../Services/CropService/crop.service.js";

const router = express.Router();

router.post("/:station_id/recommendCrops", async (req, res) => {
	const brief: Array<Measurement<"Temperature" | "Humidity" | "Pressure", "°C" | "hPa" | "%">> = req.body;
	const cropService = Service.GetInstance();

	const temperature = brief.find(b => b.name = "Temperature");
	const humidity = brief.find(b => b.name = "Humidity");
	const pressure = brief.find(b => b.name = "Pressure");

	const recommendedCrops = cropService.RecommendCropsFor({
		temperature: parseFloat(temperature + ""),
		humidity: parseFloat(humidity + ""),
		pressure: parseFloat(pressure + "")
	});

	res.send(recommendedCrops);
});

export default router;