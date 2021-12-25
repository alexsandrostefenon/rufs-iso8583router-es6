import {MicroServiceClient} from "../../rufs-base-es6/MicroServiceClient.js";
import {HttpRestRequest} from "../../rufs-base-es6/webapp/es6/ServerConnection.js";
import {ISO8583RouterMicroService} from "../ISO8583RouterMicroService.js";
import {MessageAdapterISO8583} from "../MessageAdapterISO8583.js"
import net from "net";

const iso8583defaultConf = {
	"items": [
		{"id": 0, "fieldName": "msgType", "minLength": 4},
		{"id": 2, "fieldName": "pan", "minLength": 12, sizeHeader: 2},
		{"id": 3, "fieldName": "codeProcess", "minLength": 6},
		{"id": 4, "fieldName": "transactionValue", "minLength": 12},
		{"id": 11, "fieldName": "captureNsu", "minLength": 6},
		{"id": 39, "fieldName": "codeResponse", "minLength": 2},
		{"id": 42, "fieldName": "captureEc", "minLength": 15},
		{"id": 41, "fieldName": "equipamentId", "minLength": 8},
		{"id": 67, "fieldName": "numPayments", "minLength": 2}
	]
};

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
	const server = net.createServer(socket => {
		console.log(`[Test] conexao recebida do cliente ${commConf.name} - ${socket.port} -  ${socket.localPort}`);

		socket.on("data", data => {
			console.log(`[Test] received message in ${commConf.name}`);
			const message = {};
			const size = (data[0] - 48) * 1000 + (data[1] - 48) * 100 + (data[2] - 48) * 10 + (data[3] - 48);
			if (size + 4 != data.length) throw new Error(`Size header don't match with package length`);
			const strIn = new TextDecoder("utf-8").decode(data.slice(4));//"ISO-8859-1");
			MessageAdapterISO8583.parse(message, iso8583defaultConf, strIn);
			lastMsgTypeInAuth = message.msgType;

			if (message.msgType == "0200" && message.codeProcess == "003000") {
				message.msgType = "0210";
				message.codeResponse = "00";
				const strOut = MessageAdapterISO8583.generate(message, iso8583defaultConf);
				const strOutSize = strOut.length.toString().padStart(4, "0");
				socket.write(strOutSize + strOut, () => console.log(`Enviado ${strOutSize + strOut}`));
			} else if (message.msgType == "0202" && message.codeProcess == "003000") {
				console.log(`[Test] received confirmation in ${commConf.name}`);
			} else {
				console.error(`[Test] invalid transaction :`, message);
			}
		});
	});

	return new Promise((resolve, reject) => {
		server.listen({host: commConf.ip, port: commConf.port}, () => {
			resolve();
		});
	});
}

const request = (socket, messageOut, waitResponse) => {
	const dataSend = MessageAdapterISO8583.generate(messageOut, iso8583defaultConf);
	return new Promise((resolve, reject) => socket.write(dataSend, () => resolve())).
	then(() => {
		if (waitResponse == false) return Promise.resolve();
		return new Promise((resolve, reject) => {
			socket.on('data', data => {
				const messageIn = {};
				const strIn = new TextDecoder("utf-8").decode(data);//"ISO-8859-1");
				MessageAdapterISO8583.parse(messageIn, iso8583defaultConf, strIn);
				resolve(messageIn);
			});
		});
	});
};

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
			let client;
			return new Promise((resolve, reject) => {
				client = net.createConnection(commConf, () => resolve());
			}).
			then(() => request(client, message, true)).
			then(messageIn => {
				console.log("...resposta recebida:", messageIn);
				if (messageIn == null || messageIn.msgType != "0210" || messageIn.codeResponse != "00") throw new Error(`invalid response`);
				message.msgType = "0202";
				return request(client, message, false);
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
