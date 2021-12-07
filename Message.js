package org.domain.financial.messages;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.List;

import org.domain.financial.entity.Transaction;
import org.domain.utils.Logger;
import org.domain.utils.Utils;

// classe que extende os campos que não são arquivados no banco de dados
public class Message extends Transaction {
/**
	 * 
	 */
	private static final long serialVersionUID = -2493890204849274992L;

	private static final ArrayList<String> fixedFieldNames = Message.getFixedFieldsNames();
	// alguns roots de mensagens não direfenciam a entrada e saída, por isto é preciso
	// forçar outro rootName, pois quando entra tem um tipo de parâmetro e quando sai tem outro
	public static final String DIRECTION_NAME_S2C = "_s2c";
	public static final String DIRECTION_NAME_C2S = "_c2s";
	private static Integer lastId = 0;
	
	// para montar e quebrar mensagens
	StringBuilder bufferAuxLocal = new StringBuilder(1024);
	public StringBuilder auxData = new StringBuilder(1024);
	public StringBuilder bufferParseGenerateDebug = new StringBuilder(1024);
	public byte[] bufferComm = new byte[10*1024];
	
	// indice do Pool de conex�o de transmiss�o da mensagem
	private Integer poolCommId;
	boolean enableBinarySkip;
	private boolean isAsciiHexExpanded;
	public boolean lockNotify = false;
	public boolean transmissionTimeout;
	public String rawData;

	public Message() {
		super();
		// TODO Auto-generated constructor stub
	}

	public Integer getPoolCommId() {
		return poolCommId;
	}

	public void setPoolCommId(Integer poolCommId) {
		this.poolCommId = poolCommId;
	}

	// habilita ou desabilita o parser de caracteres binÃ¡rios escapeados por (XX), onde XX Ã© o valor em hexa.
	public void setEnableBinarySkip(boolean enableBinarySkip) {
		this.enableBinarySkip = enableBinarySkip;
	}

	public boolean isAsciiHexExpanded() {
		return isAsciiHexExpanded;
	}
	
	public void setAsciiHexExpanded(boolean isAsciiHexExpanded) {
		this.isAsciiHexExpanded = isAsciiHexExpanded;
	}
	
	public void setMsgTypeResponse(String msgType) {
		if (msgType != null) {
			int val = Integer.parseInt(msgType);
			val += 10;
			msgType = String.format("%04d", val);
			setMsgType(msgType);
		}
	}
	
	public void setMsgTypeConfirmation(String msgType) {
		if (msgType != null) {
			int val = Integer.parseInt(msgType);
			val += 2;
			msgType = String.format("%04d", val);
			setMsgType(msgType);
		}
	}
	
	public void setMsgTypeConfirmation() {
		String msgType = getMsgType();
		
		if (msgType != null && Utils.isUnsignedInteger(msgType)) {
			int val = Integer.parseInt(msgType);
			
			if (msgType.endsWith("10")) {
				val -= 10;
			}
			
			val += 2;
			msgType = String.format("%04d", val);
			setMsgType(msgType);
		}
	}

	public static Integer nextId() {
		return lastId++;
	}
	
	private static ArrayList<String> getFixedFieldsNames() {
		Field[] fields = Transaction.class.getDeclaredFields();
		ArrayList<String> ret = new ArrayList<String>(fields.length);
		
		for (Field field : fields) {
			String name = field.getName();
			
			if (name.equals("dinamicFields") == false && name.equals("fixedFieldNames") == false) {
				field.setAccessible(true);
				ret.add(name);
			}
		}
		
		return ret;
	}

	public static Object readFixedFieldData(Object obj, String name) {
		Object data;
		
		try {
			Field field = Transaction.class.getDeclaredField(name);
			field.setAccessible(true);
			data = field.get(obj);
		} catch (Exception e) {
			data = null;
		}

		return data;
	}

	public void clear() {
		for (String fixedFieldName : Message.fixedFieldNames) {
			try {
				writeFixedFieldData(fixedFieldName, null);
			} catch (Exception e) {
				// TODO Auto-generated catch block
				e.printStackTrace();
			}
		}
		
		this.dinamicFields.clear();
	}

	public String getFieldData(String name) {
		String data;
		
		if (Utils.findInList(Message.fixedFieldNames, name) >= 0) {
			Object obj = Message.readFixedFieldData(this, name);
			
			data = obj != null ? obj.toString() : null;
		} else {
			data = this.dinamicFields.get(name);
		}

		return data;
	}

	private void writeFixedFieldData(String name, Object value) throws Exception {
		Field field = Transaction.class.getDeclaredField(name);
		field.setAccessible(true);
		// TODO : fazer cast de tipo
		
		if (value != null) {
			if (value.getClass().equals(String.class)) {
				Class<?> _class = field.getType();
				
				if (_class.equals(String.class)) {
					field.set(this, value);
				} else if (_class.equals(Integer.class)) {
					field.set(this, Integer.parseInt((String) value));
				} else if (_class.equals(Long.class)) {
					field.set(this, Long.parseLong((String) value));
				} else {
					throw new Exception(String.format("writeFixedFieldData : Invalid class : %s", _class.toString()));
				}
			} else {
				field.set(this, value);
			}
		} else {
			field.set(this, value);
		}
	}

	public void setFieldData(String name, String value) throws Exception {
		if (Utils.findInList(Message.fixedFieldNames, name) >= 0) {
			writeFixedFieldData(name, value);
		} else {
			this.dinamicFields.put(name, value);
		}
	}

	public void copyFrom(Message other, boolean overwrite) throws Exception {
		for (String name : Message.fixedFieldNames) {
			Field field = this.getClass().getDeclaredField(name);
			Object _value = field.get(this);
			
			if (_value == null || overwrite == true) {
				Object value = field.get(other);
				field.set(this, value);
			}
		}
		
		for (String key : other.dinamicFields.keySet()) {
			String _value = this.dinamicFields.get(key);
			
			if (_value == null || _value.length() == 0 || overwrite == true) {
				String value = other.dinamicFields.get(key);
				this.dinamicFields.put(key, value);
			}
		}
	}

	public static String compare(Message transactionRef, Message transaction, String[] fieldsCompare) throws Exception {
		String ret = null;

		if (fieldsCompare != null) {
			for (int i = 0; i < fieldsCompare.length; i++) {
			  String fieldName = fieldsCompare[i];
			  Object valRef = transactionRef.getFieldData(fieldName);
			  Object val = transaction.getFieldData(fieldName);

				if (valRef == null && val == null) {
					continue;
				} else if (valRef == null || val == null || valRef.equals(val) == false) {
					ret = fieldName;
					break;
				}
			}
		}

		return ret;
	}
	
	// return field name of first unlike and non null and non empty field in fieldsCompare in both transactions.
	// if this function return null, therefore both transaction are equal in fieldCompare respect.
	public static String compareMask(Message transactionMask, Message transaction, String[] fieldsCompare) throws Exception {
		String ret = null;

		for (int i = 0; i < fieldsCompare.length; i++) {
			String field = fieldsCompare[i];
			String valMask = transactionMask.getFieldData(field);
			String val = transaction.getFieldData(field);

			if (valMask != null && valMask.length() > 0 && valMask.equals(val) == false) {
				ret = field;
				break;
			}
		}

		return ret;
	}
	
	public static Integer getFirstCompatible(List<Message> list, Message messageRef, String[] fields, Logger logger, String logHeader) throws Exception {
		Integer ret = null;

		for (int i = 0; i < list.size(); i++) {
			Message message = list.get(i);
			String fieldName = Message.compareMask(message, messageRef, fields);
			logger.log(Logger.LOG_LEVEL_DEBUG, logHeader, String.format("diference in field [%s] - %s/%s - [%s]", fieldName, i, list.size(), message), messageRef);
			
			if (fieldName == null) {
				ret = i;
				logger.log(Logger.LOG_LEVEL_DEBUG, logHeader, "found", messageRef);
				break;
			}
		}
		
		return ret;
	}
	
	public static Message getFirstCompatible(List<Message> list, Message messageRef, String[] fields, boolean remove, Logger logger, String logHeader) throws Exception {
		Message message = null;
		Integer pos = Message.getFirstCompatible(list, messageRef, fields, logger, logHeader);

		if (pos != null) {
			message = list.get(pos);
			
			if (remove) {
				list.remove(message);
			}
		}
		
		return message;
	}

	@Override
	public String toString() {
		StringBuilder buffer = new StringBuilder(2048);
		buffer.append(String.format("poolCommId=%d|", this.poolCommId));
		
		for (String fieldName : Message.fixedFieldNames) {
			String value = getFieldData(fieldName);
			
			if (value != null) {
				buffer.append(fieldName);
				buffer.append("=");
				buffer.append(value);
				buffer.append("|");
			}
		}

		buffer.append(getDinamicFields());
		return buffer.toString();
	}

}
