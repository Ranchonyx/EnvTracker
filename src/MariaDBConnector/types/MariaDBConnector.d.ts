export type MariaDBConnectorConfigSpec = {
	host: string,
	database: string,
	user: string,
	password: string,
	connectionLimit?: number
};