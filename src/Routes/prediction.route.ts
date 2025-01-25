import express from "express";
import Service from "../Services/PredictionService/prediction.service.js";
import {Measurement} from "../WebUI/DBResponses.js";

const router = express.Router();

router.post("/:station_id/train", async (req, res) => {
	const predictionService = await Service.GetInstance();
	const measurementData: [
		Array<Measurement<"Temperature", "°C">>,
		Array<Measurement<"Humidity", "%">>,
	] = req.body;

	const tempTensor = predictionService.MakeTensorFromMeasurements(measurementData[0]);
	const humTensor = predictionService.MakeTensorFromMeasurements(measurementData[1]);

	await predictionService.Train(tempTensor, humTensor);

	res.sendStatus(200);

})

router.get("/:station_id/predictTemperature", async (req, res) => {
	const predictionService = await Service.GetInstance();

	const predictions = await predictionService.Predict(req.params.station_id);
	const withOffsets = predictions.map((pre, idx) => {
		return {
			offset: idx,
			value: pre
		};
	})

	res.send(withOffsets);
});

export default router;