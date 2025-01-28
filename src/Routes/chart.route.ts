import express from "express";
import ChartService from "../Services/ChartService/chart.service.js";
import {Measurement} from "../WebUI/DBResponses.js";
import {AllMeasurementType, AllMeasurementUnit} from "../Util/MeasurementUtil.js";

const router = express.Router();

router.post("/:station_id/transform", async (req, res) => {
	const chartService = ChartService.GetInstance();

	const measurementData: Array<Measurement<AllMeasurementType, AllMeasurementUnit>> = req.body;
	if (!Array.isArray(measurementData) || measurementData.length === 0) {
		res.sendStatus(400);
		return
	}

	const unit = measurementData[0].unit;
	const label = measurementData[0].name;

	const dataset = await chartService.CreateDataset(label, measurementData.map(e => e.value));
	const chartData = await chartService.CreateChart(measurementData.map(e => e.timestamp), [dataset], label, unit, "line");

	res.send(chartData);
})
export default router;