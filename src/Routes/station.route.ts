import express from "express";
import StationService from "../Services/StationService/station.service.js"

const router = express.Router();

router.get(`/:station_id`, async (req, res) => {
	const stationService = StationService.GetInstance();

	const querySingleStationResponse = await stationService.QueryStation(req.params.station_id);
	res.send(querySingleStationResponse);
});

export default router;