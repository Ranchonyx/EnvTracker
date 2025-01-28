import {AllMeasurementType, AllMeasurementUnit} from "../Util/MeasurementUtil.js";

export type QueryStationMetaResponse = {
	StationName: string;
	StationLocation: string;
	StationDescription: string;
	StationBattery: number;
	StationGuid: string;
}

export type QueryTenantIdResponse = {
	TenantId: string;
}

export type QueryTenantNameResponse = {
	TenantName: string;
}

export type QueryStationResponse = QueryStationMetaResponse & {
	StationSerialNumber: string;
	StationSolarPanel: number;
	StationStatusFlags: any;
}

export type QuerySensorResponse = {
	guid: string;
	name: string;
	status_flags: number;
}

export type QuerySensorsResponse = Array<QuerySensorResponse>;

export type Measurement<T extends AllMeasurementType, U extends AllMeasurementUnit> = {
	name: T;
	unit: U;
	value: number;
	timestamp: string;
}

export type QueryLatestMeasurementsResponse<T extends AllMeasurementType = AllMeasurementType> = Record<T, number>;

export type QueryStationStatusResponse = QueryLatestMeasurementsResponse<"Temperature" | "Humidity" | "Pressure" | "Battery Voltage">;

/*{
	temperature: number;
	humidity: number;
	pressure: number;
	cloudy: boolean;
}*/