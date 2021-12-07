import {MicroServiceClient} from "../rufs-base-es6/MicroServiceClient.js";
import Connector from "../MicroService.js";
import Comm from "../Comm.js";

const rufsClient = new MicroServiceClient({"appName":"iso8583router", "user":"guest", "password":"123456"});

rufsClient.login().then(() => {
	const request = (logger, connName, waitResponse, message) => {
		rufsClient.services.commConf.get({"name": connName}, false).then(resultCommConf => {
			if (resultCommConf.length <= 0) return Promise.reject(new Error(`missing configuration for ${connName}`));
			const commConf = resultCommConf.pop();
			const comm = new Comm(commConf, logger);
			return comm.send(message).then(() => {
				if (waitResponse != true) return Promise.response({});
				return comm.receive({}, null);
			});
		});
	}

	const serverInstance = new Connector({"logLevel": "DEBUG"});
	console.log("iniciando servidor...");
	serverInstance.listen().then(() => {
		const message = {
			msgType: "0200",
			codeProcess: "003000",
			pan: "1234567890123456",
			transactionValue: 100.00,
			numPayments: 1,
			captureNsu: 1,
			captureEc: 1,
			equipamentId: "1"
		};

		console.log("...servidor iniciado.");
		console.log("enviando solicitação de compra...");
		sendRequest(serverInstance, "POS-test-emu", message).
		then(sendRequestResponse => {
			console.log("...resposta recebida.");
		}).
		finally(() => serverInstance.stop()).
		then(() => console.log("servidor finalizado"));
	});

});

