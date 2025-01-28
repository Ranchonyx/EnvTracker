import express from "express";
import ChartService from "../Services/ChartService/chart.service.js";
import MeasurementService from "../Services/MeasurementService/measurement.service.js";
import StationService from "../Services/StationService/station.service.js"
import {AllMeasurementType, AllMeasurementUnit} from "../Util/MeasurementUtil.js";
import {Measurement, QueryStationStatusResponse} from "../WebUI/DBResponses.js";
import {OmitMany} from "../Util/Omit.js";
import {Guard} from "../Util/Guard.js";
import Service from "../Services/ChartService/chart.service.js";

const router = express.Router();

router.get("/:station_id/brief", async (req, res) => {
	const {station_id} = req.params;
	const measurementService = MeasurementService.GetInstance();
	const queryLatestResponse = await measurementService.QueryStatusForStation(station_id);

	// @ts-ignore
	res.send(OmitMany<typeof queryLatestResponse, "rn">(queryLatestResponse, "rn"));
})

router.get("/:station_id/types", async (_req, res) => {
	const measurementService = MeasurementService.GetInstance();
	const AvailableMeasurementTypes = await measurementService.QueryAvailableMeasurementTypes();

	res.send(AvailableMeasurementTypes);
})

router.get("/:station_id/:type", async (req, res) => {
	Guard.CastAs<{
		from?: string;
		to?: string;
		forDay?: string;
		groupBy?: "HOUR" | "MINUTE" | "HOUR_AND_MINUTE";
		chart?: "bar" | "line";
		aggregation?: "avg" | "min" | "max";
	}>(req.query);
	Guard.CastAs<AllMeasurementType>(req.params.type);

	const {to, from, forDay, groupBy} = req.query;
	const {station_id, type} = req.params;

	const measurementService = MeasurementService.GetInstance();
	const chartService = Service.GetInstance();

	const AvailableMeasurementTypes = await measurementService.QueryAvailableMeasurementTypes();

	if (!AvailableMeasurementTypes.includes(type as AllMeasurementType)) {
		res.status(400).send("No such measurement type available.");
		return;
	}

	const shouldSendAllData = to === undefined && from === undefined && forDay === undefined;
	const shouldSendRangeData = to !== undefined && from !== undefined && forDay === undefined;
	const shouldSendDayData = to === undefined && from === undefined && forDay !== undefined;

	const shouldSendChartData = req.query.chart !== undefined;
	const shouldSendAggregationData = req.query.aggregation !== undefined;

	if (!shouldSendAllData && !shouldSendRangeData && !shouldSendDayData) {
		res.status(400).send("Invalid query parameters.");
		return;
	}

	/*
	* 	const dataset = await chartService.CreateDataset(label, measurementData.map(e => e.value));
	const chartData = await chartService.CreateChart(measurementData.map(e => e.timestamp), [dataset], label, unit);

	* */

	if (shouldSendAllData) {
		const allDataForType = await measurementService.QueryMeasurementsOfType(station_id, "all", type);
		if (shouldSendChartData) {
			const asChart = await chartService.SingleChartFromMeasurement(allDataForType, req.query.chart!);
			res.send(asChart);
			return;
		}

		if (shouldSendAggregationData) {
			res.send(measurementService.AggregateMeasurements(allDataForType, req.query.aggregation!));
			return;
		}

		res.send(allDataForType);
	}

	if (shouldSendRangeData) {
		const rangedDataForType = await measurementService.QueryMeasurementsOfTypeInDateRange(station_id, type, from, to, groupBy);
		if (shouldSendChartData) {
			const asChart = await chartService.SingleChartFromMeasurement(rangedDataForType, req.query.chart!);
			res.send(asChart);
			return;
		}

		if (shouldSendAggregationData) {
			res.send(measurementService.AggregateMeasurements(rangedDataForType, req.query.aggregation!));
			return;
		}

		res.send(rangedDataForType);
	}

	if (shouldSendDayData) {
		const dayStart = new Date(forDay);
		dayStart.setHours(0, 0, 0, 0);

		const dayEnd = new Date(forDay);
		dayEnd.setHours(24, 59, 59, 999);

		const dayDataForType = await measurementService.QueryMeasurementsOfTypeInDateRange(station_id, type, dayStart.toISOString(), dayEnd.toISOString(), groupBy);

		if (shouldSendChartData) {
			const asChart = await chartService.SingleChartFromMeasurement(dayDataForType, req.query.chart!);
			res.send(asChart);
			return;
		}

		if (shouldSendAggregationData) {
			res.send(measurementService.AggregateMeasurements(dayDataForType, req.query.aggregation!));
			return;
		}

		res.send(dayDataForType);
	}
})

export default router;