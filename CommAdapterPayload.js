class CommAdapterPayload {

	send(comm, message, payload) {
		comm.os.write(payload);
	}

	receive(comm, message, payload) {
		let rc = -1;
		let readen = comm.is.read(payload, 0, payload.length);

		if (readen > 0) {
			rc = readen;
		} else {
			throw new IOException("CommAdapterPayload.read : Invalid size received");
		}

		return rc;
	}

	setup(paramsSend, paramsReceive) {
	}

}

export {CommAdapterPayload};
