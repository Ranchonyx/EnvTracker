import express from "express";
import CropService from "../Services/CropService/crop.service.js";
import MeasurementService from "../Services/MeasurementService/measurement.service.js";

const router = express.Router();

router.get("/:station_id/recommendCrops", async (req, res) => {
	const cropService = CropService.GetInstance();
	const measurementService = MeasurementService.GetInstance();

	const brief = await measurementService.QueryStatusForStation(req.params.station_id);

	const temperature = brief.find(b => b.name === "Temperature")!;
	const humidity = brief.find(b => b.name === "Humidity")!;
	const pressure = brief.find(b => b.name === "Pressure")!;

	const recommendedCrops = cropService.RecommendCropsFor({
		temperature: temperature.value || 0,
		humidity: humidity.value || 0,
		pressure: pressure.value || 0
	});

	res.send(recommendedCrops);
});

export default router;