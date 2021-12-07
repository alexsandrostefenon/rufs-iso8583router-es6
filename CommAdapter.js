package org.domain.financial.messages.comm;
import org.domain.financial.messages.Message;

public interface CommAdapter {
	public void send(Comm comm, Message message, byte[] payload) throws Exception;
	
	public int receive(Comm comm, Message message, byte[] payload) throws Exception;

	public void setup(String paramsSend, String paramsReceive);
			
}
