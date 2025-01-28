import express from "express";
import PredictionService from "../Services/PredictionService/prediction.service.js";
import {Measurement} from "../WebUI/DBResponses.js";
import MeasurementService from "../Services/MeasurementService/measurement.service.js";
import ChartService from "../Services/ChartService/chart.service.js";

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

router.get("/:station_id/predict", async (req, res) => {
	const predictionService = await PredictionService.GetInstance();
	const modelService = await predictionService.GetPredictionService(req.params.station_id);

	const predictions = await modelService.Predict(req.params.station_id);
	const withOffsets: Array<Measurement<"Temperature", "°C">> = predictions.map((pre, idx) => {
		return {
			value: pre,
			unit: "°C",
			name: "Temperature",
			timestamp: `P+${idx}`
		};
	})

	res.send(withOffsets);
});

/*router.get("/:station_id/predictChart", async (req, res) => {
	const measurementService = MeasurementService.GetInstance();
	const predictionService = await PredictionService.GetInstance();
	const modelService = await predictionService.GetPredictionService(req.params.station_id);
	const chartService = ChartService.GetInstance();

	const dayStart = new Date();
	dayStart.setHours(0, 0, 0, 0);

	const dayEnd = new Date(dayStart);
	dayEnd.setHours(24, 59, 59, 999);

	const temperatureDataForToday = await measurementService.QueryMeasurementsOfTypeInDateRange(req.params.station_id, "Temperature", dayStart.toISOString(), dayEnd.toISOString());
	const temperaturePredictions = await modelService.Predict(req.params.station_id);
	const mappedPredictions: Array<Measurement<"Temperature", "°C">> = temperaturePredictions.map((pre, idx) => {
		return {
			value: pre,
			unit: "°C",
			name: "Temperature",
			timestamp: `P+${idx}`
		}
	});

	const predictionDataset = chartService.CreateDataset("P(Temperature)", chartService.MapMeasurements(mappedPredictions).data);

	predictionDataset.backgroundColor = "rgba(255, 99, 132, 0.2)";
	predictionDataset.borderColor = "rgba(255, 99, 132, 1)";
	predictionDataset.label = "P(Temperature)";

	const mergedLabels = [...temperatureDataForToday.map(e => e.timestamp), ...mappedPredictions.map(e => e.timestamp)]

	const chart = chartService.SingleChartFromMeasurement(temperatureDataForToday, "line");
	chart.data.labels = mergedLabels;

	const alignedHistoricalData = [
		...temperatureDataForToday,
		...new Array(temperaturePredictions.length).fill(null) // Add placeholders for predictions
	];
	const alignedPredictionData = [
		...new Array(chart.data.labels.length - predictionDataset.data.length).fill(null), // Add placeholders before predictions
		...predictionDataset.data
	];

	predictionDataset.data = alignedPredictionData;
	chart.data.datasets[0].data = alignedHistoricalData;

	chart.data.datasets.push(predictionDataset);

	res.send(chart);
});*/

export default router;