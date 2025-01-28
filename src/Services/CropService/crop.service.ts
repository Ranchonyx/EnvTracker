import {RegisteredLogger} from "../../Logger/Logger.js";
import MariaDBConnector from "../../MariaDBConnector/MariaDBConnector.js";

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

	public CropDatabase: Array<CropDbEntry> = [
		{
			name: "Wheat",
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
			name: "Barley",
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
			name: "Rye",
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
			name: "Potatoes",
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
			name: "Sugar Beet",
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
			name: "Corn (Maize)",
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
			name: "Rapeseed (Canola)",
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
			name: "Carrots",
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
			name: "Apples",
			conditions: {
				minTemp: 5,
				maxTemp: 20,
				minHumidity: 50,
				maxHumidity: 80,
				minPressure: 1010,
				maxPressure: 1025,
			}
		},
		{
			name: "Strawberries",
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
			name: "Cabbage",
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
			name: "Onions",
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
			name: "Peas",
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

	/*
	* Prüfe, ob ein Eintrag der CropDb für die gegebenen Wetterbedingungen passend ist
	* */
	public IsCropSuitableFor(crop: CropDbEntry, conditions: EnvRecord) {
		const {minTemp, maxTemp, minHumidity, maxHumidity, minPressure, maxPressure} = crop.conditions;
		return (
			conditions.temperature >= minTemp &&
			conditions.temperature <= maxTemp &&
			conditions.humidity >= minHumidity &&
			conditions.humidity <= maxHumidity &&
			conditions.pressure >= minPressure &&
			conditions.pressure <= maxPressure
		);
	}

	/*
	* Ein Array an Nutzpflanzen zurückgeben, die für einen gegebenen Datensatz an Wetterdaten passend sind
	* */
	public RecommendCropsFor(environmentalData: EnvRecord) {
		const suitableCrops = this.CropDatabase.filter((crop) =>
			this.IsCropSuitableFor(crop, environmentalData)
		);

		this.log(`Suitable crops for ${JSON.stringify(environmentalData)}: ${suitableCrops.join(", ")}`);
		return suitableCrops.map(crop => crop.name);
	}
}