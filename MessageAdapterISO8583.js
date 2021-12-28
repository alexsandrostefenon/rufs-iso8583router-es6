import {MessageAdapterConfItem, DataType} from "./MessageAdapterConfItem.js";

class MessageAdapterISO8583 {
	//private 
	static getRootName(msgType, codeProcess) {
		let ret = null;

		if (codeProcess == null || /^\d{6}$/.test(codeProcess) == false) {
			ret = msgType + "_000000";
		} else {
			ret = msgType + "_" + codeProcess;
		}
		
		return ret;
	}
	// se enableCompress == true, esta funcao deve rececer 'data' jah convertida com Utils.convertToHexAscii
	static parse(message, adapterConf, str, directionSuffix) {
		const getRootISO8583 = (firstByteFromBitMap, mapSize, msgType, str) => {
			let offet = 4;
			const map = str.substring(offet, offet+mapSize);
			offet += mapSize;

			if (/^[\dA-F]+$/i.test(map) == false) {
				throw new Error(`Invalid map of bits`);
			}
			// verifica se tem bit 2
			if ((firstByteFromBitMap & 0x40) != 0) {
				let strPanLen = str.substring(offet, offet+2);
				offet += 2;
				const panLen = Number.parseInt(strPanLen);
				offet += panLen;
			}

			let codeProcess = null;
			// verificar se o mapa de bits tem o bit 3, caso contrário retorna null
			if ((firstByteFromBitMap & 0x20) != 0) {
				codeProcess = str.substring(offet, offet+6);
			}

			return this.getRootName(msgType, codeProcess);
		}
		// se enableCompress == true, esta funcao deve rececer 'src' jah convertida com Utils.convertToHexAscii
		//private 
		const parseData = (message, conf, src, offset, sizeToRead, isAsciiHexExpanded) => {
			if (conf.dataType == null) conf.dataType = DataType.DECIMAL;
			let oddRightAlign = false;
			// TODO : verificar o motivo desta excessão
			if (["22", "32"].includes(conf.tag)) {
				oddRightAlign = true;
			}

			let isAsciiHexExpandedValue = isAsciiHexExpanded;
			let mayBeAlpha = (conf.dataType & DataType.ALPHA) > 0;
			let mayBeSpecial = (conf.dataType & DataType.SPECIAL) > 0;

			if ((mayBeAlpha == false) && (mayBeSpecial == false)) {
				isAsciiHexExpandedValue = false;
			}

			let sizeSkip = 0;

			if (mayBeSpecial == true && message.enableBinarySkip == true) {
				let srcSize = src.length;
				src = Utils.replaceBinarySkipes(src, offset, sizeToRead);
				sizeSkip = srcSize - src.length;
			}

			let value;

			try {
				if (isAsciiHexExpandedValue == true) {
					const appendAsciiHexToBinary = (buffer, src, offset, srcLength, bytesByValue, escapeCharIn, escapeCharOut) => {
						let posEnd = offset + srcLength;

						for (i = offset; i < posEnd; i += bytesByValue) {
							let ch;

							if (bytesByValue == 2) {
								ch = Utils.hexToInt(src, i, 2, escapeCharIn, escapeCharOut);
								buffer.push(ch);
							} else if (bytesByValue == 4) {
								ch = Utils.hexToInt(src, i, 2, escapeCharIn, escapeCharOut);
								buffer.push(ch);
								ch = Utils.hexToInt(src, i+2, 2, escapeCharIn, escapeCharOut);
								buffer.push(ch);
							} else {
								throw new Error(`MessageAdapterISO8583.appendAsciiHexToBinary : invalid bytesByValue value (${bytesByValue})`);
							}
						}
					}

					sizeToRead *= 2;
					const buffer = new Array();
					appendAsciiHexToBinary(buffer, src, offset, sizeToRead, 2, '*', '0');
					value = buffer.join("");
				} else if (isAsciiHexExpanded != true || (sizeToRead % 2) == 0) {
					value = src.substring(offset, offset + sizeToRead);
				} else if (oddRightAlign) {
					offset++;
					value = src.substring(offset, offset + sizeToRead);
				} else {
					value = src.substring(offset, offset + sizeToRead);
					sizeToRead++;
				}
			} catch (e) {
				throw new Error(`MessageAdapterISO8583.parse - error in src.substring(${offset}, ${offset + sizeToRead}) - src = ${src} : ${e.message}`);
			}

			MessageAdapterConfItem.setFieldData(conf, message, value);
			offset += sizeToRead + sizeSkip;
			return offset;
		}
		// se enableCompress == true, esta funcao deve rececer 'src' jah convertida com Utils.convertToHexAscii
		//private 
		const parseField = (message, conf, src, offset, isAsciiHexExpanded) => {
			let srcSize = src.length;

			if (offset > srcSize) {
				throw new Error(`offset (${offset}) > srcSize (${srcSize})`);
			}

			const maxDataLength = conf.maxLength | conf.minLength;
			let sizeHeader = conf.sizeHeader | 0;
			let sizeToRead;
			// extrai o tamanho dos dados
			if (sizeHeader > 0) {
				if (isAsciiHexExpanded && ((sizeHeader % 2) != 0)) {
					sizeHeader++;
				}

				sizeToRead = Number.parseInt(src.substr(offset, sizeHeader));
				offset += sizeHeader;
			} else if (sizeHeader == 0) {
				sizeToRead = maxDataLength;
			} else {
				sizeToRead = srcSize - offset;

				if (sizeToRead > maxDataLength) {
					sizeToRead = maxDataLength;
				}
			}

			if (sizeToRead == 0) {
				MessageAdapterConfItem.setFieldData(conf, message, null);
			} else {
				offset = parseData(message, conf, src, offset, sizeToRead);
			}

			return offset;
		}

		message.msgType = str.substring(0, 4);

		if (str.length < (4+16)) {
			throw new Exception("Short message length");
		}

		let offset = 4;
		let mapSize = 16;
		const firstByteFromBitMap = Number.parseInt(str.substr(4, 2), 16);

		if ((firstByteFromBitMap & 0x80) != 0) {
			mapSize *= 2;
		}

		offset += mapSize;
		const bitMask = new Array(128+1); 

		for (let i = 0, bit = 1; i < mapSize; i++) {
			let bits = Number.parseInt(str.substr(4+i, 2), 16);
			i++;

			for (let c = 0; c < 8; c++, bit++, bits <<= 1) {
				if ((bits & 0x80) != 0) {
					bitMask[bit] = true;
				}
			}
		}

		message.root = getRootISO8583(firstByteFromBitMap, mapSize, message.msgType, str);
		const confs = adapterConf.items.filter(element => element.rootPattern == null || message.root.search(element.rootPattern) >= 0);

		for (let bit = 2, numBits = mapSize*4; bit <= numBits; bit++) {
			if (bitMask[bit]) {
				try {
					const conf = adapterConf.items.find(element => element.tag != null ? element.tag == bit.toString() : element.id == bit);
					if (conf == null) throw new Error(`don't find configuration`);
					offset = parseField(message, conf, str, offset);
				} catch (e) {
					throw new Error(`MessageAdapterISO8583.parse - error in bit ${bit} : ${e.message}`);
				}
			}
		}
	}

	static generate(message, adapterConf) {
		const addField = (buffer, message, conf, value, isAsciiHexExpanded) => {
			if (conf.dataType == null) conf.dataType = DataType.DECIMAL;
			let mayBeAlpha = (conf.dataType & DataType.ALPHA) > 0;
			let mayBeSpecial = (conf.dataType & DataType.SPECIAL) > 0;
			let expandedData = isAsciiHexExpanded;

			if ((mayBeAlpha == false) && (mayBeSpecial == false)) {
				expandedData = false;
			}

			let sizeHeader = conf.sizeHeader | 0;
			let strLen = value.length;

			if (sizeHeader > 0) {
				if (isAsciiHexExpanded == true && (sizeHeader % 2) != 0) {
					buffer.push(strLen.toString().padStart(sizeHeader + 1, "0"));
				} else {
					buffer.push(strLen.toString().padStart(sizeHeader, "0"));
				}
			}

			let oddRightAlign = false;
			// TODO : verificar o motivo desta excessão
			if (["22", "32"].includes(conf.tag)) {
				oddRightAlign = true;
			}

			if (expandedData == true) {
				const unCompress = (buffer, src) => {
					for (i = 0; i < src.length; i++) {
						let c;
						c = src.charAt(i);
						c = (c & 0xF0) >> 4;
						c += c >= 0 && c <= 9 ? 0x30 : 0x37;
						buffer.push(c);
						c = (src.charAt(i) & 0x0F);
						c += c >= 0 && c <= 9 ? 0x30 : 0x37;
						buffer.push(c);
					}
				}

				unCompress(buffer, value);
			} else if (isAsciiHexExpanded != true || (strLen % 2) == 0) {
				buffer.push(value);
			} else if (oddRightAlign) {
				buffer.push('0');
				buffer.push(value);
			} else {
				buffer.push(value);
				buffer.push('1');
			}
		}

		message.root = this.getRootName(message.msgType, message.codeProcess);
		const confs = adapterConf.items.filter(element => element.rootPattern == null || message.root.search(element.rootPattern) >= 0);
		const buffer = new Array();
		const msgType = message.msgType;
		buffer.push(msgType);
		let sizeMap = 16;
		const values = new Array(128+1);
		const usedConfs = new Array(128);
		let lastField = 0;
		//verifica se usa o segundo mapa de Bits
		for (let field = 0; field < 128; field++) {
			const conf = adapterConf.items.find(element => element.tag != null ? element.tag == field.toString() : element.id == field);

			if (conf != null) {
				const value = MessageAdapterConfItem.getFieldDataWithAlign(conf, message);
				
				if (value != null) {
					values[field] = value;
					usedConfs[field] = conf;
					lastField = field;
				}
			}
		}
		
		if (lastField >= 65) {
			sizeMap = 32;
			values[1] = "";
		}
		// Faz o Zoneamento e monta a string
		for (let i = 0, field = 1; i < sizeMap; i++) {
			let bitZone = 0;

			for (let j = 0; j < 4; j++) {
				bitZone <<= 1;

				if (values[field++] != null) {
					bitZone |= 1;
				}
			}

			buffer.push("0123456789ABCDEF".charAt(bitZone));
		}

		for (let field = 2; field < 128; field++) {
			let value = values[field];

			if (value != null && value.length > 0) {
				addField(buffer, message, usedConfs[field], value);
			}
		}

		let ret = buffer.join("");
		
		if (ret.length < (4+6+16)) {
			throw new Error("MessageAdapterISO8583 : fail in generate let for message : " + message.toString());
		}
		
		return ret;
	}
}

export {MessageAdapterISO8583}
