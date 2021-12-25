import {Logger} from "../rufs-base-es6/Logger.js";
import {CommAdapterSizePayload} from "./CommAdapterSizePayload.js"
import {CommAdapterPayload} from "./CommAdapterPayload.js"
import {MessageAdapterISO8583} from "./MessageAdapterISO8583.js"
import {MessageAdapterTTLV} from "./MessageAdapterTTLV.js"
import net from "net";

const binaryEndian = {
	"UNKNOW": "UNKNOW",
	"BIG" :"BIG",
	"LITTLE": "LITTLE"
};

const direction = {
	"DIRECTION_NAME_S2C": "_s2c",
	"DIRECTION_NAME_C2S": "_c2s"
};

function StringFormat() {
	var a = arguments[0];
	for (var k in arguments) {
		if (k == 0) continue;
		a = a.replace(/%s/, arguments[k]);
	}
	return a
}

class Comm {
	//public
	static loadMessageAdapterConfs(entityManager, logger) {
		const next = list => {
			if (list.length == 0) return Promise.resolve();
			const messageAdapterConf = list.shift();
			return entityManager.find("messageAdapterConfItem", {messageAdapterConf: messageAdapterConf.name}).
			then(items => {
				messageAdapterConf.items = items;
				Comm.messageAdapterConfMap.set(messageAdapterConf.name, messageAdapterConf);
				return next(list);
			})
		}

		return entityManager.find("messageAdapterConf").then(list => next(list));
	}
	// retorna o novo offset
	//public : BinaryEndian packageType, int val
	static packInt(buffer, offset, numBytes, packageType, val) {
		if (numBytes < 0 || numBytes > 4) {
			throw new Error();
		}

		if (packageType == BinaryEndian.LITTLE) {
			for (let i = 0; i < numBytes; i++) {
				buffer[offset++] = (byte) (val & 0x000000ff);
				val >>= 8;
			}
		} else if (packageType == BinaryEndian.BIG) {
			for (let i = numBytes-1; i >= 0; i--) {
				buffer[offset+i] = (byte) (val & 0x000000ff);
				val >>= 8;
			}

			offset += numBytes;
		} else {
			throw new Error();
		}

		return offset;
	}
	// retorna o novo offset
	//public
	static pack(buffer, offset, numBytes, valByteArray) {
		if (numBytes < 0 || numBytes > valByteArray.length) {
			throw new Error();
		}

		for (let i = 0; i < numBytes; i++) {
			buffer[offset++] = valByteArray[i];
		}

		return offset;
	}
	// retorna o novo offset
	//public : InputStream is, RefInt val
	static unpack(is, buffer, offset, numBytes, packageType, val) {
		let readen = is.read(buffer, offset, numBytes);
		
		if (readen < 0) {
			return readen;
		}

		if (readen != numBytes) {
			throw new IOException();
		}

		val.value = 0;

		if (numBytes < 0 || numBytes > 4) {
			throw new Error();
		}

		if (packageType == BinaryEndian.LITTLE) {
			for (let i = numBytes-1; i >= 0; i--) {
				val.value <<= 8;
				val.value |= (buffer[offset+i] & 0x000000ff);
			}

			offset += numBytes;
		} else if (packageType == BinaryEndian.BIG) {
			for (let i = 0; i < numBytes; i++) {
				val.value <<= 8;
				val.value |= (buffer[offset++] & 0x000000ff);
			}
		} else {
			throw new Error();
		}

		return offset;
	}
	//public  : int logLevel, String header
	log(logLevel, header, text, message) {
		if (this.logger != null) {
			this.logger.log(logLevel, header, text, message);
		}
	}
	//private : String root
	static generateMessage(message, messageAdapterConfName, root) {
		let ret = message.rawData;
		const adapterConf = Comm.messageAdapterConfMap.get(messageAdapterConfName);

		if (adapterConf != null) {
			const adapter = adapterConf.adapter == "ttlv" ? MessageAdapterTTLV : MessageAdapterISO8583;
			ret = adapter.generate(message, adapterConf, root);

			if (ret == null) {
				throw new Error("MessageAdapterConfManager.generateMessage : fail in generate String for message : " + message.toString());
			}
		} else {
			throw new Error(StringFormat("MessageAdapterConfManager.generateMessage : don't found MessageAdapterConf for module = %s", messageAdapterConfName));
		}
		
		return ret;
	}
	// private
	setupOnData(socket) {
		this.socket.on("data", buffer => {
			this.log(Logger.LOG_LEVEL_DEBUG, "Comm.setupOnData", StringFormat("...received [%s - %s - %s] %s bytes", this.conf.name, this.socket.port, this.socket.localPort, buffer.length));
			if ((buffer.length + this.bufferReceiveOffset) > this.bufferReceive.length)
				throw new Error(`[Comm.setupOnData.on('data')] bufferReceive is full (${this.conf.name})`);
			this.bufferReceive.set(buffer, this.bufferReceiveOffset);
			this.bufferReceiveOffset += this.socket.bytesRead;
			const size = this.commAdapter.receive(this);
			if (size <= 0) return; // wait for more data
			const data = this.bufferReceive.slice(0, size);
			this.bufferReceive.set(this.bufferReceive.slice(size), 0);
			this.bufferReceiveOffset -= size;
			const str = new TextDecoder("utf-8").decode(data);//"ISO-8859-1");
			const message = {};

			try {
				this.log(Logger.LOG_LEVEL_DEBUG, "Comm.setupOnData.onData", `[${this.conf.name}] parsing ${str}`);
				Comm.parseMessage(message, this.conf.messageAdapterConf, null, str, this.directionNameReceive);
			} catch (e) {
				this.log(Logger.LOG_LEVEL_ERROR, "Comm.setupOnData",
						StringFormat("fail in parseMessage [%s] : [msgSize = %s] : %s", this.conf.name, str.length, e.message),
						message);
				throw e;
			}

			message.moduleIn = this.conf.name;
			this.listReceive.push(message);
			this.log(Logger.LOG_LEVEL_INFO, "Comm.setupOnData", StringFormat("received [%s - %s - %s] : %s", this.conf.name, this.socket.port, this.socket.localPort, str), message);
		});
	}
	//public
	connect() {
		return new Promise((resolve, reject) => {
			if (this.socket != null) {
				resolve();
			} else {
				this.socket = net.createConnection(this.conf, () => {
					this.logger.log(Logger.LOG_LEVEL_DEBUG, "Comm.connect.connectToServer", StringFormat("conexao estabelecida com o servidor [%s - %s - %s]", this.conf.name, this.socket.port, this.socket.localPort), null);
					this.setupOnData(this.socket);
					resolve();
				});
			}
		});
	}
	//public teste
	send(message) {
		return this.connect().
		then(() => {
			this.log(Logger.LOG_LEVEL_DEBUG, "Comm.send", `exported [${this.conf.name}]`, message);
			let str = Comm.generateMessage(message, this.conf.messageAdapterConf, message.root);
			this.log(Logger.LOG_LEVEL_DEBUG, "Comm.send", `sending buffer [${this.conf.name} - ${this.socket.port} - ${this.socket.localPort}] : [${str.length}] ${str}`, message);
			const buffer = new TextEncoder("utf-8").encode(str);//"ISO-8859-1"
			return this.commAdapter.send(this, message, buffer).then(() => {
				this.log(Logger.LOG_LEVEL_INFO, "Comm.send", `sended [${this.conf.name}] : [${str.length}] ${str}`, message);
			});
		});
	}
	//private : String data, String directionSuffix
	static parseMessage(message, messageAdapterConfName, root, data, directionSuffix) {
		const adapterConf = Comm.messageAdapterConfMap.get(messageAdapterConfName);

		if (adapterConf != null) {
			const adapter = adapterConf.adapter == "ttlv" ? MessageAdapterTTLV : MessageAdapterISO8583;
			adapter.parse(message, adapterConf, data, directionSuffix, root);
		} else {
			throw new Error(StringFormat("MessageAdapterConfManager.generateMessage : don't found MessageAdapterConf for module = %s", messageAdapterConfName));
		}
	}
	//public
	receive() {
		return this.connect().
		then(() => {
			this.log(Logger.LOG_LEVEL_DEBUG, "Comm.receive", StringFormat("wait receive [%s - %s - %s] ...", this.conf.name, this.socket.port, this.socket.localPort));
			return new Promise((resolve, reject) => {
				const callback = partialData => {
					if (this.listReceive.length == 0) return;
					this.socket.off("data", callback);
					const message = this.listReceive.shift();
					resolve(message);
				};

				this.socket.on("data", callback);
				callback();
			});
		});
	}
	//CommConf conf
	constructor(conf, logger, socket) {
		this.conf = conf;
		this.socket = socket;
		this.bufferReceiveOffset = 0;
		this.bufferReceive = new Uint8Array(64 * 1024);
		this.bufferSend = new Uint8Array(64 * 1024);
		this.logger = logger;
		this.listReceive = new Array();

		if (conf.adapter == "CommAdapterSizePayload")
			this.commAdapter = new CommAdapterSizePayload();
		else
			this.commAdapter = new CommAdapterPayload();

		if (socket != null) {
			this.directionNameReceive = direction.DIRECTION_NAME_C2S;
//			this.directionNameSend = direction.DIRECTION_NAME_S2C;
		} else {
			this.directionNameReceive = direction.DIRECTION_NAME_S2C;
//			this.directionNameSend = direction.DIRECTION_NAME_C2S;
		}

		if (socket != null) this.setupOnData(socket);
		this.log(Logger.LOG_LEVEL_DEBUG, "Comm.initialize", `modulo v2 [${conf.name}]`);
	}
	//public
	close() {
		this.log(Logger.LOG_LEVEL_DEBUG, "Comm.close", StringFormat("fechando conexao... [%s - %s - %s]", this.conf.name, this.socket.getPort(), this.socket.getLocalPort()), null);
		
		if (this.socket.isClosed() == false) {
			this.socket.close();
			this.log(Logger.LOG_LEVEL_DEBUG, "Comm.close", StringFormat("...conexao fechada [%s - %s - %s]", this.conf.name, this.socket.getPort(), this.socket.getLocalPort()), null);
		}
	}
}

Comm.messageAdapterConfMap = new Map();

export {Comm};
