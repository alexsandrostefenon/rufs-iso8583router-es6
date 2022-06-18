import {CrudMicroService} from "../rufs-crud-es6/CrudMicroService.js";
import {Logger} from "../rufs-base-es6/Logger.js";
import {OpenApi} from "../rufs-base-es6/webapp/es6/OpenApi.js";
import {RequestFilter} from "../rufs-base-es6/RequestFilter.js";
import {Response} from "../rufs-base-es6/server-utils.js";
import {Comm} from "./Comm.js";
import net from "net";
import fs from "fs";
import url from "url";
import path from "path";

function StringFormat() {
	var a = arguments[0];
	for (var k in arguments) {
		if (k == 0) continue;
		a = a.replace(/%s/, arguments[k]);
	}
	return a
}

const RequestsDirection = {
	"CLIENT_TO_SERVER": 0, "SERVER_TO_CLIENT": 1, "BIDIRECIONAL": 2
}

class Message {
	static getFirstCompatible(list, messageRef, fields, remove, logger, logHeader) {
		// return field name of first unlike and non null and non empty field in fieldsCompare in both transactions.
		// if this function return null, therefore both transaction are equal in fieldCompare respect.
		const compareMask = (transactionMask, transaction, fieldsCompare) => {
			let ret = null;

			for (const field of fieldsCompare) {
				const valMask = transactionMask[field];
				if (valMask == null) continue;
				const regExp = new RegExp(valMask);
				const val = transaction[field];

				if (regExp.test(val) == false) {
					ret = field;
					logger.log(Logger.LOG_LEVEL_DEBUG, logHeader, `diference in field ${field} : [${valMask}] [${val}]`);
					break;
				}
			}

			return ret;
		}

		const pos = list.findIndex(message => compareMask(message, messageRef, fields) == null);
		if (pos < 0) return null;
		const message = list[pos];
		if (remove == true) list.splice(pos, 1);
		return message;
	}

	static copyFrom(messageIn, messageOut, overwrite) {
		for (let [fieldName, value] of Object.entries(messageIn)) {
			if (overwrite == false && messageOut[fieldName] != null) continue;
			messageOut[fieldName] = value;
		}
	}
}

class ISO8583RouterLogger extends Logger {
	// public : int logLevel, String header
	log(logLevel, header, text, message) {
		const logLevelName = this.logId(logLevel);
		if (logLevelName == "") return;
		let transactionId = 0;
		let modules = "";
		let objStr = "";
		let root = "";

		if (message != null) {
			objStr = message.toString();
			root = message.root;

			transactionId = message.id | 0;
			let moduleIn = message.moduleIn;
			let module = message.module;
			let moduleOut = message.moduleOut;

			if (moduleIn != null && moduleIn.length > 15) {
				moduleIn = moduleIn.substring(0, 15);
			}

			if (module != null && module.length > 15) {
				module = module.substring(0, 15);
			}

			if (moduleOut != null && moduleOut.length > 15) {
				moduleOut = moduleOut.substring(0, 15);
			}

			if (root == null) {
				root = "";
			}

			if (moduleIn != null || module != null || moduleOut != null) {
				modules = `${moduleIn} -> ${module} -> ${moduleOut}`;

				if (modules.length > 35) {
					modules = modules.substring(0, 35);
				}
			}
		}

		const timeStamp = new Date().toISOString();
		console.log(`${timeStamp} - ${logLevelName.padStart(10)} - ${transactionId.toString().padStart(10, "0")} - ${header.padStart(20)} - ${root.padStart(20)} - ${modules.padStart(30)} - ${text.padStart(40)} - ${objStr}`);
	}
}
// acesso aos servidores que não mandam sonda e ou outras solicitações na ordem inversa da conexão
class SessionClientToServerUnidirecional {
	execute(messageOut) {
		const comm = new Comm(this.commConf, logger);
		return comm.send(messageOut).then(() => {
			if (messageOut.replyEspected != "1") return Promise.resolve();
			return comm.receive();
		});
	}

	constructor(commConf, logger) {
		this.commConf = commConf;
		this.logger = logger;
	}
}
// acesso aos servidores que mandam sonda e ou outras solicitações na ordem inversa da conexão (ex.: OI. Claro, Bancos, etc...)
class SessionClientToServerBidirecional {
	execute(messageOut) {
		// se não tiver timeout definido, vou assumir o timeout padrão
		let timeout = messageOut.timeout;
		if (timeout == null) timeout = 30000;
		return this.comm.send(messageOut).
		then(() => {
			if (messageOut.replyEspected != true) return Promise.resolve();
			this.logger.log(Logger.LOG_LEVEL_TRACE, "C.SessionBidirecional.execute", `wait response in ${timeout} ms [${this.comm.conf.name}] ...`, messageOut);
			return new Promise((resolve, reject) => {
				const callbackReceive = () => {
					const messageIn = Message.getFirstCompatible(this.comm.listReceive, messageOut, this.fieldsCompare, true, this.logger, "C.Bidirecional.execute");
					if (messageIn == null) return;
					this.comm.socket.off("data", callbackReceive);
					resolve(messageIn);
				};

				setTimeout(() => reject(new Error("timeout")), timeout);
				this.comm.socket.on("data", callbackReceive);
				callbackReceive();
			})
		});
	}

	start() {
		return new Promise((resolve, reject) => {
			if (this.commConf.listen == true) {
				this.logger.log(Logger.LOG_LEVEL_TRACE, "C.Bidirecional.run", `servidor levantado [${this.commConf.name} : ${this.commConf.port}]`);
				this.server = net.createServer(socket => {
					this.logger.log(Logger.LOG_LEVEL_TRACE, "C.Bidirecional.run", `server.accept() [${JSON.stringify(this.commConf)} : ${socket.getRemoteSocketAddress()}]`, null);
					this.comm = new Comm(this.commConf, this.logger, socket);
				});
				this.server.listen({host: this.commConf.ip, port: this.commConf.port}, () => resolve());
			} else {
				this.comm = new Comm(this.commConf, this.logger);
				resolve();
			}
		});
	}

	constructor(commConf, fieldsCompare, logger) {
		this.commConf = commConf;
		this.fieldsCompare = fieldsCompare;
		this.logger = logger;
	}
}

class ISO8583RouterMicroService extends CrudMicroService {
	//public
	route(message) {
		const ref = Message.getFirstCompatible(this.messagesRouteRef, message, this.fieldsRouteMask, false, this.logger, "Connector.route");
		if (ref == null || ref.module == null) throw new Error(`fail to find router destination`);
		Message.copyFrom(ref, message, false);
		message.sendResponse = false;
		message.systemDateTime = new Date();
		this.logger.log(Logger.LOG_LEVEL_TRACE, "Connector.route", StringFormat("routing to module [%s]", ref.module), message);
		let sessionClient = this.clients.find(element => element.commConf.name == message.module);

		if (sessionClient == null) {
			sessionClient = this.bidirecionals.find(element => element.commConf.name == message.module);
		}

		if (sessionClient == null) throw new Error(`Dont find connection for ${message.module}`);
		this.logger.log(Logger.LOG_LEVEL_TRACE, "ISO8583RouterMicroService.route", StringFormat("sending to [%s]", sessionClient.commConf.name), message);
		return sessionClient.execute(message);
	}

	listen() {
		const connectorServer = commConf => {
			return net.createServer(client => {
				this.logger.log(Logger.LOG_LEVEL_DEBUG, "ConnectorServer.run", StringFormat("conexao recebida do cliente [%s - %s - %s]", commConf.name, client.port, client.localPort), null);
				const comm = new Comm(commConf, this.logger, client);

				client.on("data", partialBuffer => {
					comm.receive().
					then(message => {
						this.logger.log(Logger.LOG_LEVEL_TRACE, "ConnectorServer.req", StringFormat("[%s] : routing", commConf.name), message);
						return this.route(message).
						then(message => {
							if (message == null) return Promise.resolve();
							return comm.send(message);
						}).catch(err => {
							if (err == null) err = new Error(`Unmaped error !`);
							this.logger.log(Logger.LOG_LEVEL_ERROR, "Router.listen.onData", `[${commConf.name}] : ${err.message}`, message);
						});
					});
				});
			});
		}

		return super.listen().
		then(() => {
			this.logger.log(Logger.LOG_LEVEL_TRACE, "Connector.start", "inicializando...", null);
			this.stop();
			this.isStopped = false;
			// TODO : recarregar messagesRouteRef do banco de dados
			this.messagesRouteRef = [
				{msgType: "0200", codeProcess: "003000", pan: "4\\d{15}", replyEspected: true, module: "VISA"},
				{msgType: "0200", codeProcess: "003000", pan: "5\\d{15}", replyEspected: true, module: "MASTERCARD"},
				{msgType: "0202", codeProcess: "003000", pan: "4\\d{15}", replyEspected: false, module: "VISA"},
				{msgType: "0202", codeProcess: "003000", pan: "5\\d{15}", replyEspected: false, module: "MASTERCARD"},
			];
			Comm.loadMessageAdapterConfs(this.entityManager, this.logger);
			return this.entityManager.find("commConf").
			then(list => {
				const next = list => {
					if (list.length == 0) return;
					const commConf = list.shift();
					if (commConf.enabled == false) return next(list);
					const moduleName = commConf.name;
					let found = false;
					this.logger.log(Logger.LOG_LEVEL_DEBUG, "Connector.start", `avaliando conexao : ${commConf.name}`);

					if (commConf.listen == false && commConf.permanent == false && commConf.direction == RequestsDirection.CLIENT_TO_SERVER) {
						this.logger.log(Logger.LOG_LEVEL_TRACE, "Connector.start", `habilitando cliente : ${commConf.name} porta ${commConf.port}`);
						const session = new SessionClientToServerUnidirecional(commConf, this);
						this.clients.add(session);
						found = true;
					}

					if ((commConf.listen == true && commConf.direction == RequestsDirection.CLIENT_TO_SERVER)) {
						this.logger.log(Logger.LOG_LEVEL_TRACE, "Connector.start", `iniciando servidor... : ${commConf.name} ${commConf.ip}:${commConf.port}`);
						const session = connectorServer(commConf);
						this.servers.push(session);
						return new Promise((resolve, reject) => {
							session.listen({host: commConf.ip, port: commConf.port}, () => resolve());
						}).
						then(() => {
							this.logger.log(Logger.LOG_LEVEL_TRACE, "Connector.start", `..iniciado servidor : ${commConf.name} ${commConf.ip}:${commConf.port}`);
							return next(list);
						});
					} else if (commConf.direction == RequestsDirection.BIDIRECIONAL) {
						const fieldsCompare = ["providerEC", "equipamenId", "captureNSU"];
						this.logger.log(Logger.LOG_LEVEL_TRACE, "Connector.start", `iniciando sessao bidirecional... : ${commConf.name} porta ${commConf.port}`);
						const session = new SessionClientToServerBidirecional(commConf, fieldsCompare, this.logger);
						this.bidirecionals.push(session);
						return session.start().then(() => next(list));
					} else if (found == false) {
						console.log("Connector.start : invalid communication configuration for module " + moduleName);
						return next(list);
					}
				}

				return next(list);
			}).then(() => {
				this.logger.log(Logger.LOG_LEVEL_TRACE, "Connector.start", "...iniciado", null);
			});
		});
	}

	stop() {
		// TODO : aguardar todas as sessons finalizarem
		this.logger.log(Logger.LOG_LEVEL_TRACE, "Connector.stop",	"--------------------------------------------------------------------------------------", null);
		this.logger.log(Logger.LOG_LEVEL_TRACE, "Connector.stop", "Finishing sessions...", null);
		this.isStopped = true;

		for (const session of this.bidirecionals) {
			if (session.server != null) {
				session.server.close();
				console.log(`closed server ${session.commConf.name}`);
			} else if (session.comm != null && session.comm.socket != null) {
				session.comm.socket.destroy();
				console.log(`closed client ${session.commConf.name}`);
			}
		}
		
		for (const session of this.servers) {
			if (session.server != null) {
				session.server.close();
				console.log(`closed server ${session.commConf.name}`);
			}
		}
		// exclui as sess�es antigas para garantir que ap�s o start as transa��es
		// sejam feitas coms as configura��es atualizadas
		this.clients = [];
		this.bidirecionals = [];
		this.servers = [];
		this.logger.log(Logger.LOG_LEVEL_TRACE, "Connector.stop", "...sessions finischieds.", null);
		this.logger.log(Logger.LOG_LEVEL_TRACE, "Connector.stop",	"--------------------------------------------------------------------------------------", null);
	}

	constructor(config) {
		if (config == null) config = {};
		if (config.logLevel == null) config.logLevel = Logger.LOG_LEVEL_DEBUG;//LOG_LEVEL_INFO
		const defaultStaticPaths = path.join(path.dirname(url.fileURLToPath(import.meta.url)), "webapp");
		config.defaultStaticPaths = config.defaultStaticPaths != undefined ? config.defaultStaticPaths + "," + defaultStaticPaths : defaultStaticPaths;
		super(config, config.appName || "iso8583router");
		// atributos internos
		this.isStopped = true;
		this.servers = new Array();//ConnectorServer
		this.clients = new Array();//SessionClientToServerUnidirecional
		this.bidirecionals = new Array();//SessionClientToServerBidirecional
		// route
		this.messagesRouteRef = new Array();//Message
		this.fieldsRouteMask = "msgType,codeProcess,pan".split(",");
		// logger
		this.logger = new ISO8583RouterLogger(config.logLevel);
	}

	loadOpenApi() {
		return super.loadOpenApi().
		then(() => {
			const requestSchemas = {"payment": {properties: {
				"msgType": {enum: ["0200", "0202"]},
				"pan": {pattern: "^\\d{12,16}$"},
				"codeProcess": {enum: ["002000", "003000"]},
				"transactionValue": {type: "number"},
				"captureNsu": {type: "integer"},
				"captureEc": {type: "integer"},
				"equipamentId": {maxLength: 8},
				"numPayments": {type: "integer"}
			}}};
			const responseSchemas = {payment: {properties: {
				"msgType": {enum: ["0210"]},
				"codeProcess": {enum: ["002000", "003000"]},
				"transactionValue": {type: "number"},
				"captureNsu": {type: "integer"},
				"codeResponse": {enum: ["00", "99"]},
				"captureEc": {type: "integer"},
				"equipamentId": {maxLength: 8},
				"numPayments": {type: "integer"}
			}}};
			return OpenApi.fillOpenApi(this.openapi, {"methods": ["post"], requestSchemas, "schemas": responseSchemas});
		}).
		then(() => {
			return this.storeOpenApi();
		})
	}
	// intercept any request before authorization
	onRequest(req, res, next) {
		if (req.path == "/payment") {
			const rf = new RequestFilter(req, this)
			const isAuthorized = rf.checkAuthorization(req)

			if (isAuthorized == true) {
				this.logger.log(Logger.LOG_LEVEL_TRACE, "ConnectorServer.req", `routing from http rest server...`, req.body);
				return this.route(req.body).then(messageIn => Response.ok(messageIn));
			}
		}

		return super.onRequest(req, res, next);
	}
}

ISO8583RouterMicroService.checkStandalone();

export {ISO8583RouterMicroService};
