import express from "express";
import PredictionService from "../Services/PredictionService/prediction.service.js";
import {Measurement} from "../WebUI/DBResponses.js";
import {Guard} from "../Util/Guard.js";

const router = express.Router();

router.post("/:station_id/train", async (req, res) => {
	const predictionService = await PredictionService.GetInstance();
	const measurementData: [
		Array<Measurement<"Temperature", "°C">>,
		Array<Measurement<"Humidity", "%">>,
	] = req.body;

	const modelService = await predictionService.GetPredictionService(req.params.station_id);

	await modelService.Train(measurementData[0].map(e => e.value), measurementData[1].map(e => e.value));

	res.sendStatus(200);

})

router.get("/:station_id/predictTemperature", async (req, res) => {
	Guard.CastAs<{
		limit?: number;
	}>(req.query);

	const predictionService = await PredictionService.GetInstance();
	const modelService = await predictionService.GetPredictionService(req.params.station_id);

	const predictions = await modelService.Predict(req.params.station_id, req.query.limit);
	const withOffsets = predictions.map((pre, idx) => {
		return {
			offset: idx,
			value: pre
		};
	})

	res.send(withOffsets);
});

export default router;