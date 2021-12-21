class MessageAdapterTTLV {
	
	//private
	static parse(message, conf, value) {
		if (value != null && value.length() > 0) {
			let mayBeSpecial = (conf.getDataType() == MessageAdapterConfItem.DATA_TYPE_SPECIAL);
			
			if (mayBeSpecial == true && message.enableBinarySkip == true) {
				value = Utils.replaceBinarySkipes(value, 0, value.length());
			}
			
			MessageAdapterConfItem.setFieldData(conf, message, value);
		} else {
			MessageAdapterConfItem.setFieldData(conf, message, null);
		}
	}
	
	//private
	static unEscapeBinaryData(data, escapeLeft, escapeRight, maxEscapeSize) {
		if (data == null) {
			return null;
		}
		
		if (data.length() == 0 || escapeLeft == null || escapeRight == null) {
			return data;
		}
		
		let firstPos = data.indexOf(escapeLeft);
		
		if (firstPos < 0) {
			return data;
		}
		
		let buffer = new StringBuilder(data.length());
		let offset = 0;
		let srcLen = data.length();
		
		while (offset < srcLen) {
			if (offset < srcLen - (escapeLeft.length() + 1 + escapeRight.length())) {
				if (data.startsWith(escapeLeft, offset)) {
					let posIni = offset + escapeLeft.length();
					let posEnd = data.indexOf(escapeRight, posIni);
					
					if (posEnd > posIni && posEnd <= posIni + maxEscapeSize) {
						if (/^[\dA-F]+$/i.test(data.substring(posIni, posEnd)) == true) {
							let hex = data.substring(posIni, posEnd);
							let val = Utils.hexToInt(hex, 0, posEnd-posIni, '0', '0');
							let ch = val;
							buffer.push(ch);
//							System.out.printf("value = %d - %d - %d - %d - %d - %d\n", (int) ch, (int) b[0], val, (int) buffer.join("").getBytes()[0], (int) buffer.join("").charAt(0), (int) buffer.join("").charAt(1));
							offset = posEnd + escapeRight.length();
							continue;
						}
					}
				}
			}
			
			buffer.push(data.charAt(offset++));
		}
		
		return buffer.join("");
	}

	//public
	static parse(message, adapterConf, root, data, directionSuffix) {
		// primeiro converte os escapes hexa 
		data = MessageAdapterTTLV.unEscapeBinaryData(data, "(", ")", 2);
		const confs = adapterConf.items.filter(element => element.rootPattern != null && root.search(element.rootPattern) >= 0);
		let offset = 0;

		while (offset < data.length()) {
			let pos_ini = offset;
			
			while (offset < data.length() && data.charAt(offset) > 0x04) {
				offset++;
			}
			
			if (offset < data.length() - 2) {
				let name = data.substring(pos_ini, offset);
				const conf = adapterConf.items.find(element => element.tag == name);

				if (conf == null) {
					throw new Exception(String.format("MessageAdapterTTLV.parseMessage : fail to add new field [%s]", name));
				}

				let contentType = data.charAt(offset++);
				let size = 0;
				// parseia o tamanho
				{
					let byteVal;

					do {
						byteVal = data.charAt(offset++);
						size <<= 7;
						size |= (byteVal & 0x7f);
					} while (byteVal > 0x80);
				}
				
				if (offset <= data.length() - size) {
					if (contentType == 0x04) {
						let value = data.substring(offset, offset + size);
						parse(message, conf, value);
						offset += size;
					} else {
						throw new Exception(String.format("MessageAdapterTTLV.parseMessage : contentType unsuported [%s]", contentType));
					}
				} else {
					throw new Exception(String.format("MessageAdapterTTLV.parseMessage : fail to parse data [size = %s]", size));
				}
			} else {
				throw new Exception(String.format("MessageAdapterTTLV.parseMessage : fail to parse data [data.length = %s]", data.length()));
			}
		}
	}
	// usado internamente em generate
	//private
	static insertDataLength(buffer, size) {
		let aux = new Array(10);
		let numBytes = 0;

		while (size > 0) {
			let byteVal = (char) (size & 0x0000007f);
			size >>= 7;

			if (numBytes > 0) {
				byteVal |= 0x80;
			}

			aux[numBytes] = byteVal;
			numBytes++;
		}
		
		for (i = numBytes-1; i >= 0; i--) {
			buffer.push(aux[i]);
		}
	}
	
	//public
	static generate(message, adapterConf, root) {
		const buffer = new StringBuilder(2048);
		const confs = adapterConf.items.filter(element => element.rootPattern != null && root.search(element.rootPattern) >= 0);

		for (const conf of confs) {
			let fieldName = conf.getFieldName();
			let str = conf.getFieldDataWithAlign(message);
			let size = str == null ? 0 : str.length();
			
			if (size > 0) {
				// 0042(4)(F)0000000008730110048(4)(4)00020061(4)(3)TEF0071(4)(4)0705
				buffer.push(fieldName);
				buffer.push(0x04);
				insertDataLength(buffer, size);
				buffer.push(str);
			}
		}
		
		return buffer.join("");
	}

	//public
	static getTagName(root, tagPrefix, tagName) {
		return tagName;
	}
}

export {MessageAdapterTTLV}
