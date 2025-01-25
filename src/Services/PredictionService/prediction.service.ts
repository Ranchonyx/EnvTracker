import {RegisteredLogger} from "../../Logger/Logger.js";
import MariaDBConnector from "../../MariaDBConnector/MariaDBConnector.js";
import tf, {Sequential, Tensor2D} from "@tensorflow/tfjs-node"
import {Measurement} from "../../WebUI/DBResponses.js";
import {AllMeasurementType, AllMeasurementUnit} from "../../Util/MeasurementUtil.js";
import {Guard} from "../../Util/Guard.js";
import {existsSync} from "node:fs";
import MeasurementService from "../../Services/MeasurementService/measurement.service.js";

export default class Service {
	private static instance: Service | undefined;
	private model: Sequential | undefined;

	private constructor(private log: RegisteredLogger, private mariadb: MariaDBConnector, private modelPath: string) {
	}

	public static async GetInstance(log?: RegisteredLogger, mariadb?: MariaDBConnector, modelPath?: string): Promise<Service> {
		let _instance: Service | undefined = Service.instance;
		if (!_instance && log && mariadb && modelPath) {
			log("Init");

			Service.instance = new Service(log, mariadb, modelPath);
			_instance = Service.instance;
		}

		await tf.setBackend("tensorflow");
		console.log("Active Backend:", tf.getBackend());

		Guard.AgainstNullish(_instance);

		try {
			await _instance.LoadModel();
		} catch (ex) {
			_instance.model = tf.sequential({name: "envtrack-temperature"});
			_instance.model.add(tf.layers.dense({units: 16, activation: 'relu', inputShape: [2]}));
			_instance.model.add(tf.layers.dense({units: 1})); // Output layer for temperature

			_instance.model.compile({optimizer: 'adam', loss: 'meanSquaredError'});

		}


		await _instance.SaveModel();
		//await tf.setBackend("tensorflow");
		return _instance;
	}

	public MakeTensorFromMeasurements<T extends AllMeasurementType, U extends AllMeasurementUnit>(pMeasurements: Array<Measurement<T, U>>): tf.Tensor2D {
		return tf.tensor2d(pMeasurements.map(e => e.value), [pMeasurements.length, 1], "float32");
	}

	public async Train(temperatureTensor: Tensor2D, humidityTensor: Tensor2D) {
		console.log(temperatureTensor, humidityTensor)
		const p1 = performance.now();
		this.log("Fitting...")
		const trainingTask = await this.model?.fit(temperatureTensor, humidityTensor, {
			epochs: 100,
			batchSize: 2,
			verbose: 1,
			callbacks: {
				onTrainBegin: (logs) => {
					console.warn("onTrainBegin", logs);
				},
				onTrainEnd: (logs) => {
					console.warn("onTrainEnd", logs);
				}
			}
		});
		Guard.AgainstNullish(trainingTask);
		await trainingTask.syncData();
		const p2 = performance.now();

		this.log(`Training with ${250} epochs finished in ${(p2 - p1).toFixed(2)} ms!`);

		await this.SaveModel();
	}

	public async Predict(station_guid: string) {
		const measurementService = MeasurementService.GetInstance();

		const today = new Date().toISOString();

		const startDate = new Date(today);
		startDate.setDate(startDate.getDate() - 3);

		const validTemperatures = await measurementService.QueryMeasurementsOfTypeInDateRange(station_guid, "Temperature", startDate.toISOString(), today);
		const validHumidities = await measurementService.QueryMeasurementsOfTypeInDateRange(station_guid, "Humidity", startDate.toISOString(), today);

		const zipped = validTemperatures.map(t => {
			const hum = validHumidities.find(h => h.timestamp === t.timestamp);

			return {
				temperature: parseFloat(t.value as unknown as string),
				humidity: hum ? parseFloat(hum.value as unknown as string) : 0
			}
		})

		if (zipped.length === 0)
			return [];

		this.log(`Predicting next temperature for ${zipped.length} t-h pairs...`);
		const normalised = zipped.map(dto => {
			return [dto.temperature, dto.humidity]
		})

		const tensor = tf.tensor2d(normalised, [normalised.length, 2])
		const predictions = this.model?.predict(tensor) as tf.Tensor;

		const predictedValues = predictions.dataSync();

		this.log(Array.from(predictedValues));

		return Array.from(predictedValues);
	}

	public async SaveModel() {
		this.log("Saving model...")
		Guard.AgainstNullish(this.model);
		await this.model.save(this.modelPath);
	}

	public async LoadModel() {
		if (!existsSync(this.modelPath))
			throw new Error(`Cannot load model from path "${this.modelPath}". Files do not exist`);

		const loadedModel = await tf.loadLayersModel(this.modelPath);
		Guard.CastAs<Sequential>(loadedModel);

		this.model = loadedModel;
	}
}