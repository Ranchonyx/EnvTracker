import express from "express";
import ChartService from "../Services/ChartService/chart.service.js";
import MeasurementService from "../Services/MeasurementService/measurement.service.js";
import StationService from "../Services/StationService/station.service.js"
import {AllMeasurementType, AllMeasurementUnit} from "../Util/MeasurementUtil.js";
import {Measurement, QueryStationStatusResponse} from "../WebUI/DBResponses.js";
import {OmitMany} from "../Util/Omit.js";
import {Guard} from "../Util/Guard.js";

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
		groupedBy?: "HOUR" | "MINUTE" | "HOUR_AND_MINUTE";
	}>(req.query);
	Guard.CastAs<AllMeasurementType>(req.params.type);

	const {to, from, forDay} = req.query;
	const {station_id, type} = req.params;

	const measurementService = MeasurementService.GetInstance();
	const AvailableMeasurementTypes = await measurementService.QueryAvailableMeasurementTypes();
	if (!AvailableMeasurementTypes.includes(type as AllMeasurementType)) {
		res.status(400).send("No such measurement type available.");
		return;
	}

	const shouldSendAllData = to === undefined && from === undefined && forDay === undefined;
	const shouldSendRangeData = to !== undefined && from !== undefined && forDay === undefined;
	const shouldSendDayData = to === undefined && from === undefined && forDay !== undefined;

	if (!shouldSendAllData && !shouldSendRangeData && !shouldSendDayData) {
		res.status(400).send("Invalid query parameters.");
		return;
	}

	if (shouldSendAllData) {
		const allDataForType = await measurementService.QueryMeasurementsOfType(station_id, "all", type);
		res.send(allDataForType);
		return;
	}

	if (shouldSendRangeData) {
		const rangedDataForType = await measurementService.QueryMeasurementsOfTypeInDateRange(station_id, type, from, to);
		res.send(rangedDataForType);
		return;
	}


	if (shouldSendDayData) {
		const dayStart = new Date(forDay);
		dayStart.setHours(0, 0, 0, 0);

		const dayEnd = new Date(forDay);
		dayEnd.setHours(24, 59, 59, 999);

		const dayDataForType = await measurementService.QueryMeasurementsOfTypeInDateRange(station_id, type, dayStart.toISOString(), dayEnd.toISOString());
		res.send(dayDataForType);
		return;
	}
})

export default router;