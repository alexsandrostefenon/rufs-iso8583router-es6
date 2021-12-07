package org.domain.financial.messages;

import java.util.List;

import org.domain.financial.entity.MessageAdapterConf;
import org.domain.financial.entity.MessageAdapterConfItem;
import org.domain.utils.Utils;

public class MessageAdapterTTLV implements MessageAdapter {
	
	private void parse(Message message, MessageAdapterConfItem conf, String value) throws Exception {
		if (value != null && value.length() > 0) {
			boolean mayBeSpecial = (conf.getDataType() == MessageAdapterConfItem.DATA_TYPE_SPECIAL);
			
			if (mayBeSpecial == true && message.enableBinarySkip == true) {
				value = Utils.replaceBinarySkipes(value, 0, value.length());
			}
			
			conf.setFieldData(message, value);
		} else {
			conf.setFieldData(message, null);
		}
	}
	
	private static String unEscapeBinaryData(String data, String escapeLeft, String escapeRight, int maxEscapeSize) {
		if (data == null) {
			return null;
		}
		
		if (data.length() == 0 || escapeLeft == null || escapeRight == null) {
			return data;
		}
		
		int firstPos = data.indexOf(escapeLeft);
		
		if (firstPos < 0) {
			return data;
		}
		
		StringBuilder buffer = new StringBuilder(data.length());
		int offset = 0;
		int srcLen = data.length();
		
		while (offset < srcLen) {
			if (offset < srcLen - (escapeLeft.length() + 1 + escapeRight.length())) {
				if (data.startsWith(escapeLeft, offset)) {
					int posIni = offset + escapeLeft.length();
					int posEnd = data.indexOf(escapeRight, posIni);
					
					if (posEnd > posIni && posEnd <= posIni + maxEscapeSize) {
						if (Utils.isHex(data, posIni, posEnd, true, false)) {
							String hex = data.substring(posIni, posEnd);
							int val = Utils.hexToInt(hex, 0, posEnd-posIni, '0', '0');
							char ch = (char) val;
							buffer.append(ch);
//							System.out.printf("value = %d - %d - %d - %d - %d - %d\n", (int) ch, (int) b[0], val, (int) buffer.toString().getBytes()[0], (int) buffer.toString().charAt(0), (int) buffer.toString().charAt(1));
							offset = posEnd + escapeRight.length();
							continue;
						}
					}
				}
			}
			
			buffer.append(data.charAt(offset++));
		}
		
		return buffer.toString();
	}

	public void parse(Message message, MessageAdapterConf adapterConf, String root, String data, String directionSuffix) throws Exception {
		// primeiro converte os escapes hexa 
		data = MessageAdapterTTLV.unEscapeBinaryData(data, "(", ")", 2);
		List<MessageAdapterConfItem> confs = adapterConf.getMessageAdapterConfItems(root);
		int offset = 0;

		while (offset < data.length()) {
			int pos_ini = offset;
			
			while (offset < data.length() && data.charAt(offset) > 0x04) {
				offset++;
			}
			
			if (offset < data.length() - 2) {
				String name = data.substring(pos_ini, offset);
				MessageAdapterConfItem conf = MessageAdapterConf.getMessageAdapterConfItemFromTag(confs, name);

				if (conf == null) {
					throw new Exception(String.format("MessageAdapterTTLV.parseMessage : fail to add new field [%s]", name));
				}

				int contentType = data.charAt(offset++);
				int size = 0;
				// parseia o tamanho
				{
					char byteVal;

					do {
						byteVal = data.charAt(offset++);
						size <<= 7;
						size |= (byteVal & 0x7f);
					} while (byteVal > 0x80);
				}
				
				if (offset <= data.length() - size) {
					if (contentType == 0x04) {
						String value = data.substring(offset, offset + size);
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
	private void insertDataLength(StringBuilder buffer, int size) {
		char aux[] = new char[10];
		int numBytes = 0;

		while (size > 0) {
			char byteVal = (char) (size & 0x0000007f);
			size >>= 7;

			if (numBytes > 0) {
				byteVal |= 0x80;
			}

			aux[numBytes] = byteVal;
			numBytes++;
		}
		
		for (int i = numBytes-1; i >= 0; i--) {
			buffer.append(aux[i]);
		}
	}
	
	public String generate(Message message, MessageAdapterConf adapterConf, String root) throws Exception {
		StringBuilder buffer = new StringBuilder(2048);
		List<MessageAdapterConfItem> confs = adapterConf.getMessageAdapterConfItems(root);
		
		for (MessageAdapterConfItem conf : confs) {
			String fieldName = conf.getFieldName();
			String str = conf.getFieldDataWithAlign(message);
			int size = str == null ? 0 : str.length();
			
			if (size > 0) {
				// 0042(4)(F)0000000008730110048(4)(4)00020061(4)(3)TEF0071(4)(4)0705
				buffer.append(fieldName);
				buffer.append((char) 0x04);
				insertDataLength(buffer, size);
				buffer.append(str);
			}
		}
		
		return buffer.toString();
	}

	public String getTagName(String root, String tagPrefix, String tagName) {
		return tagName;
	}
}
