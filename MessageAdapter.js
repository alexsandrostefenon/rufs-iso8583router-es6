package org.domain.financial.messages;

import org.domain.financial.entity.MessageAdapterConf;

public interface MessageAdapter {
	public void parse(Message message, MessageAdapterConf adapterConf, String root, String data, String directionSuffix) throws Exception;

	public String generate(Message message, MessageAdapterConf adapterConf, String root) throws Exception;

	public String getTagName(String root, String tagPrefix, String tagName);
}
