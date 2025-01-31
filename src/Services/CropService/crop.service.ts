import {RegisteredLogger} from "../../Logger/Logger.js";
import MariaDBConnector from "../../MariaDBConnector/MariaDBConnector.js";
import {MemoizeSync} from "../../Util/Memo.js";
import {SyncMemo} from "../../Util/Decorators.js";

type CropDbEntry = {
	name: string;
	conditions: {
		minTemp: number;
		maxTemp: number;
		minHumidity: number;
		maxHumidity: number;
		minPressure: number;
		maxPressure: number;
	}
}

type EnvRecord = {
	temperature: number
	humidity: number
	pressure: number
};

export default class Service {
	private static instance: Service | undefined;

	private CropDatabase: Array<CropDbEntry> = [
		{
			name: "Weizen",
			conditions: {
				minTemp: 10,
				maxTemp: 25,
				minHumidity: 30,
				maxHumidity: 60,
				minPressure: 1010,
				maxPressure: 1025,
			}
		},
		{
			name: "Gerste",
			conditions: {
				minTemp: 8,
				maxTemp: 20,
				minHumidity: 35,
				maxHumidity: 60,
				minPressure: 1008,
				maxPressure: 1024,
			}
		},
		{
			name: "Roggen",
			conditions: {
				minTemp: 5,
				maxTemp: 22,
				minHumidity: 40,
				maxHumidity: 65,
				minPressure: 1010,
				maxPressure: 1025,
			}
		},
		{
			name: "Kartoffeln",
			conditions: {
				minTemp: 12,
				maxTemp: 22,
				minHumidity: 60,
				maxHumidity: 80,
				minPressure: 1012,
				maxPressure: 1022,
			}
		},
		{
			name: "Zuckerrüben",
			conditions: {
				minTemp: 12,
				maxTemp: 25,
				minHumidity: 50,
				maxHumidity: 75,
				minPressure: 1010,
				maxPressure: 1025,
			}
		},
		{
			name: "Mais",
			conditions: {
				minTemp: 15,
				maxTemp: 30,
				minHumidity: 40,
				maxHumidity: 70,
				minPressure: 1008,
				maxPressure: 1020,
			}
		},
		{
			name: "Raps",
			conditions: {
				minTemp: 8,
				maxTemp: 20,
				minHumidity: 50,
				maxHumidity: 75,
				minPressure: 1010,
				maxPressure: 1025,
			}
		},
		{
			name: "Karotten",
			conditions: {
				minTemp: 10,
				maxTemp: 20,
				minHumidity: 60,
				maxHumidity: 85,
				minPressure: 1012,
				maxPressure: 1022,
			}
		},
		{
			name: "Erdbeeren",
			conditions: {
				minTemp: 12,
				maxTemp: 25,
				minHumidity: 60,
				maxHumidity: 80,
				minPressure: 1010,
				maxPressure: 1024,
			}
		},
		{
			name: "Kohl",
			conditions: {
				minTemp: 5,
				maxTemp: 18,
				minHumidity: 60,
				maxHumidity: 85,
				minPressure: 1012,
				maxPressure: 1022,
			}
		},
		{
			name: "Zwiebeln",
			conditions: {
				minTemp: 10,
				maxTemp: 25,
				minHumidity: 50,
				maxHumidity: 70,
				minPressure: 1010,
				maxPressure: 1022,
			}
		},
		{
			name: "Erbsen",
			conditions: {
				minTemp: 8,
				maxTemp: 18,
				minHumidity: 60,
				maxHumidity: 80,
				minPressure: 1012,
				maxPressure: 1025,
			}
		}
	];

	private constructor(private log: RegisteredLogger) {
	}

	public static GetInstance(log?: RegisteredLogger, mariadb?: MariaDBConnector): Service {
		if (!Service.instance && log) {
			log("Init");

			return (Service.instance = new Service(log));
		}

		return Service.instance!;
	}

	private NormalizeTanh(value: number, spread = 10): number {
		return Math.tanh(value / spread);
	}

	@SyncMemo("ComputeDeviation")
	private ComputeDeviation(min: number, max: number, val: number): number {
		return Math.max(min - val, 0) + Math.max(val - max, 0);
	}

	@SyncMemo("ComputeCropScore")
	private ComputeCropScore(crop: CropDbEntry, conditions: EnvRecord): number {
		const {minTemp, maxTemp, minHumidity, maxHumidity, minPressure, maxPressure} = crop.conditions;

		const tempDeviation = this.ComputeDeviation(minTemp, maxTemp, conditions.temperature);
		const humidityDeviation = this.ComputeDeviation(minHumidity, maxHumidity, conditions.humidity);
		const pressureDeviation = this.ComputeDeviation(minPressure, maxPressure, conditions.pressure);

		return tempDeviation + humidityDeviation + (pressureDeviation * 0.6);
	}

	@SyncMemo("RankCrops")
	private RankCrops(environmentalData: EnvRecord): Array<{ name: string, score: number }> {
		return this.CropDatabase
			.map(e => {
				return {
					score: this.NormalizeTanh(this.ComputeCropScore(e, environmentalData)),
					name: e.name
				}
			})
			.sort((a, b) => a.score - b.score);
	}

	/*
	* Ein Array an Nutzpflanzen zurückgeben, die für einen gegebenen Datensatz an Wetterdaten passend sind
	* */
	public RecommendCropsFor(environmentalData: EnvRecord, limit: number = 5) {
		const suitableCrops = this.RankCrops(environmentalData).slice(0, limit);
		/*const suitableCrops = this.CropDatabase.filter((crop) =>
			this.IsCropSuitableFor(crop, environmentalData)
		);*/

		this.log(`Suitable crops for ${JSON.stringify(environmentalData)}: ${suitableCrops.map(e => `${e.name}::${e.score}`).join(", ")}`);
		return suitableCrops.map(crop => crop.name);
	}
}