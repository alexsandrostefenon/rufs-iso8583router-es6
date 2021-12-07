import {CrudMicroService} from "../rufs-crud-es6/CrudMicroService.js";
import {Logger} from "../rufs-base-es6/Logger.js";
import {Comm} from "./Comm.js";
import {Server} from "net";
import fs from "fs";
import url from "url";
import path from "path";

const RequestsDirection = {
	"CLIENT_TO_SERVER": 0, "SERVER_TO_CLIENT": 1, "BIDIRECIONAL": 2
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
			root = message.getRoot();

			transactionId = message.getId();
			let moduleIn = message.getModuleIn();
			let module = message.getModule();
			let moduleOut = message.getModuleOut();

			if (moduleIn != null && moduleIn.length() > 15) {
				moduleIn = moduleIn.substring(0, 15);
			}

			if (module != null && module.length() > 15) {
				module = module.substring(0, 15);
			}

			if (moduleOut != null && moduleOut.length() > 15) {
				moduleOut = moduleOut.substring(0, 15);
			}

			if (root == null) {
				root = "";
			}

			if (moduleIn != null || module != null || moduleOut != null) {
				modules = `${moduleIn} -> ${module} -> ${moduleOut}`;

				if (modules.length() > 35) {
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
	execute(messageOut, messageIn) {
		const comm = new Comm(this.commConf, logger);
		comm.send(messageOut);
		const waitResponse = Connector.checkValue(messageOut.getReplyEspected(), "1");

		if (waitResponse == true) {
			comm.receive(messageIn, messageOut);
		}

		return comm;
	}

	constructor(commConf, logger) {
		this.commConf = commConf;
		this.logger = logger;
	}
}

// acesso aos servidores mandam sonda e ou outras solicitações na ordem inversa da conexão (ex.: OI. Claro, Bancos, etc...)
class SessionClientToServerBidirecional {
	execute(messageOut, messageIn) {
		const reply = messageOut.getReplyEspected();
		const waitResponse = Connector.checkValue(reply, "1");
		// se não tiver timeout definido, vou assumir o timeout padrão
		let timeout = messageOut.getTimeout();

		if (timeout == 0) {
			timeout = 30000;
		}

		if (waitResponse) {
			this.listSend.add(messageOut);
		}

		return this.comm.send(messageOut).then(() => {
			if (waitResponse != true) return Promise.resolve();
			this.logger.log(Logger.LOG_LEVEL_TRACE, "C.SessionBidirecional.execute", `wait response in ${timeout} ms [${this.comm.commConf.name}] ...`, messageOut);

			return new Promise((resolve, reject) => {
				setTimeout(() => {
					const messageRef = Message.getFirstCompatible(this.listSend, messageOut, fieldsCompare, true, Connector.this, "C.Bidirecional.execute");
					return messageRef == null ? resolve() : reject(new Error("timeout"));
				}, timeout);
			})
		});
	}

	constructor(commConf, fieldsCompare, logger) {
		this.listSend = new Array();
		this.listReceive = new Array();
		// fica bloqueante até que a conexão seja estabelecida, ou até que a
		// flag de cancelamento seja ativada.
		let promise = new Promise((resolve, reject) => {
			if (commConf.listen == true) {
				this.logger.log(Logger.LOG_LEVEL_TRACE, "C.Bidirecional.run", `servidor levantado [${commConf.name} : ${commConf.port}]`);
				this.server = new Server(commConf, socket => {
					this.logger.log(Logger.LOG_LEVEL_TRACE, "C.Bidirecional.run", `server.accept() [${JSON.stringify(commConf)} : ${socket.getRemoteSocketAddress()}]`, null);
					this.comm = new Comm(socket, commConf, Connector.this);
					resolve();
				});
			} else {
				this.comm = new Comm(commConf, logger);
				resolve();
			}
		}).then(() => {
			this.comm.receiveCallback = messageIn => {
				const messageRef = Message.getFirstCompatible(this.listSend, messageIn, fieldsCompare, true, Connector.this, "C.Bidirecional.run");

				if (messageRef != null) {
					messageRef.clear();
					messageRef.copyFrom(messageIn, false);
					messageRef.transmissionTimeout = false;
					messageRef.notify();
				} else {
					// inserir na lista de transações recebidas
					this.listReceive.add(messageIn);
					// processa as requisições (Sondas) das AUTORIZADORAS (OI. Claro, etc...)
					const promise = Connector.this.route(messageIn, commConf);
					// TODO : ativar sinal de notificação para averiguar as SONDAS
					// this.semaphoreReceive.notify();
				}
			};
		});
	}
}

class ISO8583RouterMicroService extends CrudMicroService {
	//public
	route(messageIn, commConf) {
		messageIn.setSendResponse(false);
		messageIn.setSystemDateTime(new Date());

		let module = null;
		let ref = Message.getFirstCompatible(this.messagesRouteRef, messageIn, this.fieldsRouteMask, false, this, "Connector.route");

		if (ref != null) {
			module = ref.getModule();
			messageIn.copyFrom(ref, false);
		}

		if (module != null) {
			messageIn.setModule(module);
			this.logger.log(Logger.LOG_LEVEL_TRACE, "Connector.route", String.format("routing to module [%s]", module), messageIn);
			return this.commIn(messageIn, messageIn);
		} else {
			this.logger.log(Logger.LOG_LEVEL_ERROR, "Connector.route", "fail to find router destination", messageIn);
			return Promise.reject(new Error(`dont find route`));
		}
	}
	//private
	static checkValue(strData, strValue) {
		return strData != null && strData == strValue;
	}

	listen() {
		const connectorServer = commConf => {
			return new Server(commConf, client => {
				this.logger.log(Logger.LOG_LEVEL_DEBUG, "ConnectorServer.run", String.format("conexao recebida do cliente [%s - %s - %s]", ConnectorServer.this.commConf.getName(), client.getPort(), client.getLocalPort()), null);
				const comm = new Comm(client, ConnectorServer.this.commConf, Connector.this);

				comm.onReceive = message => {
					this.logger.log(Logger.LOG_LEVEL_TRACE, "ConnectorServer.req", String.format("[%s] : routing", commConf.getName()), message);
					return this.route(message, commConf).then(message => {
						const sendResponse = message.getSendResponse();

						if (sendResponse != null && sendResponse == true) {
							return comm.send(message);
						} else {
							return Promise.resolve();
						}
					}).catch(() => {
						this.logger.log(Logger.LOG_LEVEL_ERROR, "ConnectorServer.req", String.format("[%s] : fail to route", commConf.getName()), message);
					});
				};
			});
		}

		return super.listen().then(() => {
			this.logger.log(Logger.LOG_LEVEL_TRACE, "Connector.start", "inicializando...", null);
			this.stop();
			this.isStopped = false;
			// TODO : recarregar messagesRouteRef do banco de dados
			Comm.loadMessageAdapterConfs(this.entityManager, this.logger);
			return this.entityManager.find("commConf").
			then(list => {
				for (const commConf of list) {
					if (commConf.enabled == false) continue;
					const moduleName = commConf.name;
					let found = false;
					this.logger.log(Logger.LOG_LEVEL_DEBUG, "Connector.start", `avaliando conexao : ${commConf.name}`);

					if (commConf.listen == false && commConf.permanent == false && commConf.direction == RequestsDirection.CLIENT_TO_SERVER) {
						this.logger.log(Logger.LOG_LEVEL_TRACE, "Connector.start", `habilitando cliente : ${commConf.name} porta ${commConf.port}`);
						const session = new SessionClientToServerUnidirecional(commConf, this);
						this.clients.add(session);
						found = true;
					}

					for (let j = 0; j < commConf.maxOpenedConnections; j++) {
						if ((commConf.listen == true && commConf.direction == RequestsDirection.CLIENT_TO_SERVER)) {
							this.logger.log(Logger.LOG_LEVEL_TRACE, "Connector.start", `iniciado servidor : ${commConf.name} porta ${commConf.port}`);
							this.servers.push(connectorServer(commConf));
						} else if (commConf.direction == RequestsDirection.BIDIRECIONAL) {
							const fieldsCompare = ["providerEC", "equipamenId", "captureNSU"];
							this.logger.log(Logger.LOG_LEVEL_TRACE, "Connector.start", `iniciado sessao bidirecional : ${commConf.name} porta ${commConf.port}`);
							const session = new SessionClientToServerBidirecional(commConf, fieldsCompare, this.logger);
							this.bidirecionals.push(session);
						} else if (found == false) {
							console.log("Connector.start : invalid communication configuration for module " + moduleName);
							break;
						}
					}
				}

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
			session.closeServer();
		}
		
		for (const session of this.servers) {
			session.closeServer();
		}
		// exclui as sess�es antigas para garantir que ap�s o start as transa��es
		// sejam feitas coms as configura��es atualizadas
		this.clients = [];
		this.bidirecionals = [];
		this.servers = [];
		this.logger.log(Logger.LOG_LEVEL_TRACE, "Connector.stop", "...sessions finischieds.", null);
		this.logger.log(Logger.LOG_LEVEL_TRACE, "Connector.stop",	"--------------------------------------------------------------------------------------", null);
	}
	// private 
	commOut(messageOut, messageIn) {
		let name = messageOut.getModuleOut();

		if (name == null || name.length() <= 0) {
			this.logger.log(Logger.LOG_LEVEL_ERROR, "Connector.commOut", "parameter 'name' is invalid", messageOut);
			return false;
		}

		if (name.toUpperCase().equals("PROVIDER")) {
			name = messageOut.getProviderName();
		}
		
		let sessionClient = null;

		for (let i = 0; i < this.clients.size(); i++) {
			const client = clients.get(i); // SessionClientToServerUnidirecional
			const clientName = client.commConf.getName();
			this.logger.log(Logger.LOG_LEVEL_DEBUG, "Connector.commOut", String.format("testing SessionClient client [%s] for [%s]", clientName, name), messageOut);

			if (clientName.equals(name)) {
				sessionClient = client;
				break;
			}
		}

		if (sessionClient == null) {
			for (let i = 0; i < bidirecionals.size(); i++) {
				const client = bidirecionals.get(i);// SessionClientToServerBidirecional
				const clientName = client.commConf.getName();
				this.logger.log(Logger.LOG_LEVEL_DEBUG, "Connector.commOut", String.format("testing SessionBidirecional clien [%s] for [%s]", clientName, name), messageOut);

				if (clientName.equals(name) && client.getCount() < client.commConf.getMaxOpenedConnections()) {
					sessionClient = client;
					break;
				}
			}
		}

		if (sessionClient != null) {
			this.logger.log(Logger.LOG_LEVEL_TRACE, "Connector.commOut", String.format("sending to server [%s]", name), messageOut);
			return sessionClient.execute(messageOut, messageIn);
		} else {
			this.logger.log(Logger.LOG_LEVEL_ERROR, "Connector.commOut", String.format("don't found connection for requested module [%s]", name), messageOut);
			return Promise.reject(new Error(`don't found connection for requested module ${name}`));
		}
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
		this.fieldsRouteMask = "moduleIn,msgType,codeProcess,root,codeCountry,providerId".split(",");
		// logger
		this.logger = new ISO8583RouterLogger(config.logLevel);
	}

}

ISO8583RouterMicroService.checkStandalone();

export {ISO8583RouterMicroService};
