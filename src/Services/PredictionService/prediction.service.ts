import {RegisteredLogger} from "../../Logger/Logger.js";
import MariaDBConnector from "../../MariaDBConnector/MariaDBConnector.js";
import tf, {Sequential, Tensor} from "@tensorflow/tfjs-node"
import {existsSync} from "node:fs";
import {schedule, ScheduledTask} from "node-cron";
import {Guard} from "../../Util/Guard.js";
import MeasurementService from "../../Services/MeasurementService/measurement.service.js";
import StationService from "../../Services/StationService/station.service.js";

export default class PredictionServiceRegistry {
	private static instance: PredictionServiceRegistry | undefined;

	private constructor(private log: RegisteredLogger, private mariadb: MariaDBConnector, private modelDirectory: string) {
	}

	public static async GetInstance(log?: RegisteredLogger, mariadb?: MariaDBConnector, modelDirectory?: string) {
		if (!this.instance && log && mariadb && modelDirectory) {
			this.instance = new PredictionServiceRegistry(log, mariadb, modelDirectory);
			log("Init");

			//await tf.setBackend("cpu");
		}

		return this.instance!;
	}

	/*
	* PredictionService für eine gegebene Station abrufen
	* */
	public async GetPredictionService(station_id: string): Promise<PredictionService> {
		const modelPath = `${this.modelDirectory}/${station_id}`;

		return PredictionService.Instantiate(this.log, this.mariadb, modelPath, station_id);
	}

	/*
	* Alle PredictionServices für alle verfügbaren Stationen vorinitialisieren
	* */
	public async InitialiseAllPredictionServices(): Promise<void> {
		const stationService = StationService.GetInstance(this.log, this.mariadb);
		const allIds = await stationService.QueryAllStationIds();

		await Promise.all(allIds.map(id => this.GetPredictionService.bind(this)(id)))
	}
}

class PredictionService {
	private model: Sequential | undefined;
	private schedule: ScheduledTask;

	/*
	* Intervall-Trainingsfunktion
	* */
	private async TrainFn() {
		//Train the model
		const measurementService = MeasurementService.GetInstance();

		const now = new Date().toISOString();

		const startDate = new Date(now);
		startDate.setDate(startDate.getDate() - 1);
		startDate.setHours(0, 0, 0, 0);

		const [temps, hums] = await Promise.all(
			[
				measurementService.QueryMeasurementsOfTypeInDateRange(this.station_id, "Temperature", startDate.toISOString(), now),
				measurementService.QueryMeasurementsOfTypeInDateRange(this.station_id, "Humidity", startDate.toISOString(), now)
			]
		);

		this.log(`Running scheduled training for model ${this.station_id} with ${temps.length + hums.length} records ...`);

		await this.Train(temps.map(e => e.value), hums.map(e => e.value));
	}

	private constructor(private log: RegisteredLogger, private mariadb: MariaDBConnector, private modelPath: string, private station_id: string) {
		this.schedule = schedule("*/60 */6 * * *", async () => {
			await this.TrainFn.bind(this)();
		}, {runOnInit: true})
	}

	/*
	* Existierendes Modell laden oder neu erzeugen
	*
	* Dazu wird ein neuronales Netz mit einer 3x2 Matrix erstellt, welches in 16 Neuronen leitet, welche in 32 Neuronen leiten, welche in 16 Neuronen leiten, welche in 8 Neuronen leiten, welche in ein Ausgabeneuron leiten
	* */
	public static async Instantiate(log: RegisteredLogger, mariadb: MariaDBConnector, modelPath: string, station_id: string): Promise<PredictionService> {
		log("Subservice Init");

		const instance = new PredictionService(log, mariadb, modelPath, station_id);

		//Load pre-existing model
		const hasLoadedExistingModel = await instance.LoadModel();
		if (hasLoadedExistingModel) {
			log(`Loaded pre-existing model from "${modelPath}"`);
		} else {

			//If that fails, set up the model, compile it and save it
			instance.model = tf.sequential({name: "envtrack-temperature"});

			// Input layer (flatten the 3x2 input into a 6D vector)
			instance.model.add(tf.layers.flatten({inputShape: [3, 2]}));

			// Hidden layer
			instance.model.add(tf.layers.dense({
				units: 16,         // 16 neurons
				activation: 'relu',  // ReLU activation function
			}));

			// Another hidden layer
			instance.model.add(tf.layers.dense({
				units: 32,         // 32 neurons
				activation: 'relu',  // ReLU activation function
			}));

			instance.model.add(tf.layers.dense({
				units: 16,
				activation: "relu"
			}));

			instance.model.add(tf.layers.dense({
				units: 8,
				activation: "relu"
			}));

			// Output layer (predicts the next temperature)
			instance.model.add(tf.layers.dense({
				units: 1,  // Output a single value (predicted temperature)
			}));

			// Compile the model
			instance.model.compile({
				optimizer: tf.train.adam(),  // Adam optimizer
				loss: 'meanSquaredError',    // MSE for regression tasks
				metrics: ['mae'],            // Mean Absolute Error for evaluation
			});

			await instance.SaveModel();

			log(`Created new model (adam, meanSquaredError) at "${modelPath}"`);
		}

		instance.schedule.start();

		// Compile the model
		instance.model!.compile({
			optimizer: tf.train.adam(), // Adam optimizer for better convergence
			loss: 'meanSquaredError',  // Loss function for regression
			metrics: ['mae'],          // Mean Absolute Error for evaluation
		});

		return instance;
	}

	/*
	* Time-Series-Forecasting Sequenzen aus Temperaturen und Luftfeuchtigkeiten generieren
	* */
	public CreateSequences(temperatures: Array<number>, humidities: Array<number>, sequenceLength: number) {
		const inputs: Array<Array<Array<number>>> = []; // 3D array to store sequences
		const outputs: Array<number> = [];

		// Generate sequences of temperature and humidity pairs
		for (let i = 0; i < temperatures.length - sequenceLength; i++) {
			const inputSequence: Array<Array<number>> = [];
			for (let j = i; j < i + sequenceLength; j++) {
				// Each sequence element is a pair of [temperature, humidity]
				inputSequence.push([temperatures[j], humidities[j]]);
			}

			inputs.push(inputSequence); // Push the sequence (3 pairs of [temperature, humidity])
			outputs.push(temperatures[i + sequenceLength]); // Output: the next temperature after the sequence
		}

		return {inputs, outputs};
	}

	/*
	* Modell anhand von Temperaturen und Luftfeuchtigkeiten trainieren
	* */
	public async Train(temperatures: Array<number>, humidities: Array<number>) {
		const p1 = performance.now();
		Guard.AgainstNullish(this.model);
		const epochs = 500;

		try {
			const {inputs, outputs} = this.CreateSequences(temperatures, humidities, 3);

			const inputTensor = tf.tensor3d(inputs, [inputs.length, 3, 2]);  // 3 features: [temperature, humidity] pair, sequence length = 3
			const outputTensor = tf.tensor2d(outputs, [outputs.length, 1]); // 1 output (predicted temperature)

			await this.model!.fit(inputTensor, outputTensor, {
				epochs: epochs,
				batchSize: 4,
				verbose: 0
			});
		} catch (ex) {
			console.error(ex)
		}

		const p2 = performance.now();

		this.log(`Training with ${epochs} epochs finished in ${(p2 - p1).toFixed(2)} ms!`);

		await this.SaveModel();
	}

	/*
	* Vorhersage des Modells ausführen
	*
	* Momentan sagt das Modell die Temperaturen vorher.
	* */
	public async Predict(station_guid: string) {
		const measurementService = MeasurementService.GetInstance();

		const now = new Date().toISOString();

		const startDate = new Date(now);
		startDate.setDate(startDate.getDate() - 1);
		startDate.setHours(0, 0, 0, 0);

		const validTemperatures = await measurementService.QueryMeasurementsOfTypeInDateRange(station_guid, "Temperature", startDate.toISOString(), now);
		const validHumidities = await measurementService.QueryMeasurementsOfTypeInDateRange(station_guid, "Humidity", startDate.toISOString(), now);

		if (validTemperatures.length === 0 || validHumidities.length === 0)
			return [];

		const {inputs} = this.CreateSequences(validTemperatures.map(e => e.value), validHumidities.map(e => e.value), 3);

		const inputTensor = tf.tensor3d(inputs, [inputs.length, 3, 2]);

		const predictions = this.model!.predict(inputTensor) as Tensor;

		this.log(`Predicting next temperature data ...`);

		const predictedValues = predictions.dataSync();

		this.log(Array.from(predictedValues));

		return Array.from(predictedValues);
	}

	/*
	* Aktives Vorhersagemodell speichern
	* */
	private async SaveModel() {
		this.log("Saving model...")
		Guard.AgainstNullish(this.model);
		await this.model.save(this.modelPath);
	}

	/*
	* Ein Vorhersagemodell laden
	* */
	private async LoadModel(): Promise<boolean> {
		const canLoad = existsSync(this.modelPath.slice(7));
		if (!canLoad)
			return false;

		const loadedModel = await tf.loadLayersModel(`${this.modelPath}/model.json`);
		Guard.CastAs<Sequential>(loadedModel);

		this.model = loadedModel;

		return true;
	}
}