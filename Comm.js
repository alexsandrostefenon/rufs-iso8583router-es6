import {Logger} from "../rufs-base-es6/Logger.js";
import {CommAdapterSizePayload} from "./CommAdapterSizePayload.js"
import {CommAdapterPayload} from "./CommAdapterPayload.js"
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
	static pack(buffer, offset, numBytes, packageType, val) {
		if (numBytes < 0 || numBytes > 4) {
			throw new InvalidParameterException();
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
			throw new InvalidParameterException();
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
			throw new InvalidParameterException();
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
		let ret = null;

		try {
			message.bufferParseGenerateDebug.setLength(0);
			ret = message.rawData;
			const adapterConf = Comm.messageAdapterConfMap.get(messageAdapterConfName);
			
			if (adapterConf != null) {
				const adapter = Comm.messageAdapterMap.get(adapterConf.adapter);

				if (adapter != null) {
					ret = adapter.generate(message, adapterConf, root);
					
					if (ret == null) {
						throw new Error("MessageAdapterConfManager.generateMessage : fail in generate String for message : " + message.toString());
					}
				} else {
					throw new Error(String.format("MessageAdapterConfManager.generateMessage : don't found adapter for root = %s and message = %s", root, message.toString()));
				}
			} else {
				throw new Error(String.format("MessageAdapterConfManager.generateMessage : don't found MessageAdapterConf for module = %s", messageAdapterConfName));
			}
		} catch (e) {
			e.printStackTrace();
			throw e;
		}
		
		return ret;
	}
	//public
	send(message) {
		message.lockNotify = true;
		message.setModuleOut(conf.getName());
		message.transmissionTimeout = true;
		log(Logger.LOG_LEVEL_DEBUG, "Comm.send", String.format("exported [%s]", this.conf.getName()), message);
		let str = Comm.generateMessage(message, conf.getMessageConf(), message.getRoot());
		log(Logger.LOG_LEVEL_DEBUG, "Comm.send", String.format("sending buffer [%s - %s - %s] : [%04d] %s", this.conf.getName(), this.socket.getPort(), this.socket.getLocalPort(), str.length(), str), message);
		const buffer = str.getBytes("ISO-8859-1");
		return this.commAdapter.send(this, message, buffer).then(() => {
			log(Logger.LOG_LEVEL_INFO, "Comm.send", String.format("sended [%s] : [%04d] %s", this.conf.getName(), str.length(), str), message);
		});
	}
	//private : String data, String directionSuffix
	static parseMessage(message, messageAdapterConfName, root, data, directionSuffix) {
		if (data == null) {
			throw new InvalidParameterException();
		}
		
		message.bufferParseGenerateDebug.setLength(0);
		const adapterConf = Comm.messageAdapterConfMap.get(messageAdapterConfName);

		if (adapterConf != null) {
			const adapter = Comm.messageAdapterMap.get(adapterConf.adapter);

			if (adapter != null) {
				adapter.parse(message, adapterConf, root, data, directionSuffix);
			} else {
				throw new Error(String.format("MessageAdapterConfManager.generateMessage : don't found adapter for root = %s and message = %s", root, message.toString()));
			}
		} else {
			throw new Error(String.format("MessageAdapterConfManager.generateMessage : don't found MessageAdapterConf for module = %s", messageAdapterConfName));
		}
	}
	//public
	receive(messageIn, messageRef) {
		if (this.socket == null) {
			throw new Error("disposed");
		}
		
		if (messageIn.getId() == null) {
			if (messageRef != null) {
				messageIn.setId(messageRef.getId());
			} else {
				messageIn.setId(Message.nextId());
			}
		}

		log(Logger.LOG_LEVEL_DEBUG, "Comm.receive", String.format("wait receive [%s - %s - %s] ...", this.conf.getName(), this.socket.getPort(), this.socket.getLocalPort()), messageIn);
		let size = this.commAdapter.receive(this, messageIn, messageIn.bufferComm);

		if (size > 0) {
			const str = new String(messageIn.bufferComm, 0, size, "ISO-8859-1");
			const rawData = str;
			// TODO : estou forçando um sleep para sincronizar o debug das threads
//			Thread.sleep(10);

			try {
				Comm.parseMessage(messageIn, this.conf.getMessageConf(), messageIn.getRoot(), str, this.directionNameReceive);
			} catch (e) {
				log(Logger.LOG_LEVEL_ERROR, "Comm.receive",
						String.format("parseMessage [%s] : [msgSize = %d] : %s", this.conf.getName(), size, e.getMessage()),
						messageIn);
				throw e;
			}

			messageIn.transmissionTimeout = false;
			messageIn.setModuleIn(conf.getName());
			messageIn.setModuleOut(null);
			messageIn.rawData = rawData;
			log(Logger.LOG_LEVEL_INFO, "Comm.receive", String.format("received [%s - %s - %s] : %s", this.conf.getName(), this.socket.getPort(), this.socket.getLocalPort(), str), messageIn);
		} else {
			log(Logger.LOG_LEVEL_INFO, "Comm.receive", String.format("not data received [%s - %s - %s]", this.conf.getName(), this.socket.getPort(), this.socket.getLocalPort()), messageIn);
		}

		return size;
	}
	//CommConf conf
	constructor(conf, logger, socket) {
		let isServer = true;

		if (socket == null) {
			isServer = false;
//			socket = net.createConnection(conf);
		}

		this.conf = conf;
		this.socket = socket;
		this.bufferReceive = new Uint8Array(64 * 1024);
		this.bufferSend = new Uint8Array(64 * 1024);
		this.logger = logger;
		logger.log(Logger.LOG_LEVEL_DEBUG, "Comm.initialize", `modulo v2 [${conf.name}]`);

		if (conf.adapter == "CommAdapterSizePayload")
			this.commAdapter = new CommAdapterSizePayload();
		else
			this.commAdapter = new CommAdapterPayload();

		if (isServer == true) {
			this.directionNameReceive = direction.DIRECTION_NAME_C2S;
//			this.directionNameSend = direction.DIRECTION_NAME_S2C;
		} else {
			this.directionNameReceive = direction.DIRECTION_NAME_S2C;
//			this.directionNameSend = direction.DIRECTION_NAME_C2S;
		}
	}
	//public
	close() {
		log(Logger.LOG_LEVEL_DEBUG, "Comm.close", String.format("fechando conexao... [%s - %s - %s]", this.conf.getName(), this.socket.getPort(), this.socket.getLocalPort()), null);
		
		if (this.socket.isClosed() == false) {
			this.socket.close();
			log(Logger.LOG_LEVEL_DEBUG, "Comm.close", String.format("...conexao fechada [%s - %s - %s]", this.conf.getName(), this.socket.getPort(), this.socket.getLocalPort()), null);
		}
	}
}

Comm.messageAdapterConfMap = new Map();

export {Comm};
