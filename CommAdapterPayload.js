class CommAdapterPayload {

	send(comm, message, payload) {
		return new Promise((resolve, reject) => {
			comm.socket.write(payload, () => resolve());
		});
	}

	receive(comm, message, payload) {
		return comm.bufferReceiveOffset;
	}

	setup(paramsSend, paramsReceive) {
	}

}

export {CommAdapterPayload};
