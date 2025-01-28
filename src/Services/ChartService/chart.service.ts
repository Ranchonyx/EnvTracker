import {RegisteredLogger} from "../../Logger/Logger.js";
import {AllMeasurementType, AllMeasurementUnit} from "../../Util/MeasurementUtil.js";
import {Measurement} from "../../WebUI/DBResponses.js";

type RGBString = `rgba(${number}, ${number}, ${number}, ${number})`;

type SingleChartDataset = {
	label: string;
	data: Array<number>;
	borderColor: RGBString;
	backgroundColor: RGBString;
	borderWidth: number;
	tension: number;
	fill: boolean;
}

type ChartDataset<T extends Array<string>, U extends Array<SingleChartDataset>, V extends "line" | "bar"> = {
	type: V;
	data: {
		labels: T;
		datasets: Array<SingleChartDataset>;
	};
	options: {
		animation: boolean;
		responsive: true;
		plugins: Array<object>;
		scales: {
			x: { title: { display: true, text: string } },
			y: { title: { display: true, text: string } }
		}
	};
}

export default class Service {
	private static instance: Service | undefined;

	private constructor(private log: RegisteredLogger) {
	}

	public static GetInstance(log?: RegisteredLogger): Service {
		if (!Service.instance && log) {
			log("Init");

			return (Service.instance = new Service(log))
		}

		return Service.instance!;
	}

	/*
	* Konvertiere ein Array an Messwerten eines Typs 'T' zu einem für Charts besser geeignetem Format
	* */
	public MapMeasurements<T extends AllMeasurementType, U extends AllMeasurementUnit>(pMeasurements: Array<Measurement<T, U>>): {
		data: Array<number>;
		label: T;
		unit: U;
	} {
		return {
			label: pMeasurements[0]?.name || "No label",
			data: pMeasurements.map(m => parseFloat(m.value + "")) || [],
			unit: pMeasurements[0]?.unit || "No unit",
		}
	}

	/*
	* Erzeuge ein Chart.JS-Kompatiblen Datensatz aus einem Label und einem Array an numerischen Werten
	* */
	public async CreateDataset(label: string, data: Array<number>): Promise<SingleChartDataset> {
		this.log(`Created chart dataset with label "${label}"`);

		return {
			label: label,
			data: data,
			borderColor: "rgba(75, 192, 192, 1)",
			backgroundColor: "rgba(75, 192, 192, 0.2)",
			borderWidth: 2,
			tension: 0.2,
			fill: true
		}
	}

	/*
	* Erzeuge eine Chart.JS-Kompatible Chart-Datenstruktur aus einem Array an Labels, einem Array aus SingleChartDataset, einem Label für die X- und Y-Ache und einem Diagrammtyp
	* */
	public async CreateChart<MType extends "bar" | "line">(labels: Array<string>, datasets: Array<SingleChartDataset>, xAxisLabel: string, yAxisLabel: string, type: MType): Promise<ChartDataset<Array<string>, Array<SingleChartDataset>, MType>> {
		this.log(`Created chart over ${xAxisLabel} and ${yAxisLabel}`);
		return {
			type: type,
			data: {
				labels: labels,
				datasets: datasets
			},
			options: {
				animation: false,
				responsive: true,
				plugins: [
					{
						legend: {display: true, position: "top"}
					}
				],
				scales: {
					x: {title: {display: true, text: xAxisLabel}},
					y: {title: {display: true, text: yAxisLabel}}
				}
			}
		}
	}

	/*
	* Helperfunktion um direkt aus einem Array an Messerten vom Typ 'T' ein SingleChartDataset zu erzeugen
	* */
	public async SingleChartFromMeasurement<
		T extends AllMeasurementType,
		U extends AllMeasurementUnit,
		MType extends "line" | "bar"
	>(pMeasurements: Array<Measurement<T, U>>, type: MType): Promise<ChartDataset<Array<string>, Array<SingleChartDataset>, MType>> {

		const mapped = this.MapMeasurements(pMeasurements);
		const dataset = await this.CreateDataset(mapped.label, mapped.data);

		return this.CreateChart(pMeasurements.map(m => m.timestamp), [dataset], mapped.label, mapped.unit, type);
	}
}