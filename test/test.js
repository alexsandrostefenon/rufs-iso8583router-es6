import {MicroServiceClient} from "../../rufs-base-es6/MicroServiceClient.js";
import {HttpRestRequest} from "../../rufs-base-es6/webapp/es6/ServerConnection.js";
import {ISO8583RouterMicroService} from "../ISO8583RouterMicroService.js";
import {Comm} from "../Comm.js";
import net from "net";

const getCommConfList = () => {
	const rufsClientAdmin = new MicroServiceClient({port: 9080, loginPath: "rest/login", "appName":"", "user":"admin", "password":HttpRestRequest.MD5("admin")});

	return rufsClientAdmin.login().
	then(() => {
		return rufsClientAdmin.services.rufsUser.get({"name": "iso8583router"}).
		then(userDataResponse => {
			if (userDataResponse.data != null) return Promise.resolve(userDataResponse);
			const userData = {
				"rufsGroupOwner": 1,
				"name": "iso8583router",
				"password": "e10adc3949ba59abbe56e057f20f883e",
				"roles": "{\"commConf\":{\"get\":true,\"post\":false,\"patch\":false,\"put\":false,\"delete\":false}}",
				"path": "comm_conf/search",
				"menu": "{\"commConf\":{\"menu\":\"services\",\"label\":\"commConf\",\"path\":\"comm_conf/search\"}}"
			}

			return rufsClientAdmin.services.rufsUser.save(userData);
		}).
		then(userDataResponse => {
			const rufsClient = new MicroServiceClient({port: 9080, loginPath: "rest/login", "appName":"", "user":userDataResponse.data.name, "password":userDataResponse.data.password});
			return rufsClient.login().
			then(() => {
				return rufsClient.services.commConf.queryRemote();
			});
		});
	});
}

let lastMsgTypeInAuth = "";

const createServerAuth = (commConf, logger) => {
	const server = net.createServer(client => {
		console.log(`[Test] conexao recebida do cliente ${commConf.name} - ${client.port} -  ${client.localPort}`);
		const comm = new Comm(commConf, logger, client);

		client.on("data", partialBuffer => {
			comm.receive().
			then(message => {
				console.log(`[Test] received message in ${commConf.name}`);
				lastMsgTypeInAuth = message.msgType;

				if (message.msgType == "0200" && message.codeProcess == "003000") {
					message.msgType = "0210";
					message.codeResponse = "00";
					return comm.send(message);
				} else if (message.msgType == "0202" && message.codeProcess == "003000") {
					console.log(`[Test] received confirmation in ${commConf.name}`);
				} else {
					console.error(`[Test] invalid transaction :`, message);
				}
			});
		});
	});

	return new Promise((resolve, reject) => {
		server.listen({host: commConf.ip, port: commConf.port}, () => {
			resolve();
		});
	});
}

const serverInstance = new ISO8583RouterMicroService({"logLevel": "DEBUG"});
console.log("iniciando servidor...");
serverInstance.listen().
then(() => {
	console.log("...servidor iniciado.");
	return getCommConfList().
	then(commConfList => {
		// first, create "MASTERCARD-test-emu" simulator
		return createServerAuth(commConfList.find(element => element.name == "MASTERCARD"), serverInstance.logger).
		then(() => {
			const message = {
				msgType: "0200",
				codeProcess: "003000",
				pan: "5234567890123456",
				transactionValue: 100.00,
				numPayments: 1,
				captureNsu: 1,
				captureEc: 1,
				equipamentId: "1"
			};

			console.log("enviando solicitação de compra...");
			const commConf = commConfList.find(element => element.name == "POS");
			const comm = new Comm(commConf, serverInstance.logger);
			return comm.send(message).
			then(() => comm.receive()).
			then(messageIn => {
				console.log("...resposta recebida:", messageIn);
				if (messageIn == null || messageIn.msgType != "0210" || messageIn.codeResponse != "00") throw new Error(`invalid response`);
				message.msgType = "0202";
				return comm.send(message);
			}).
			then(() => {
				return new Promise((resolve, reject) => {
					setTimeout(() => {
						if (lastMsgTypeInAuth != "0202") 
							reject(new Error(`test fail !`));
						else {
							console.log(`test Ok !`);
							resolve();
						}
					}, 5000);
				});
			}).
			catch(err => console.log(err)).
			finally(() => serverInstance.stop()).
			then(() => console.log("servidor finalizado"));
		});
	});
});
