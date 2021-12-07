
class CommAdapterSizePayload {

	send(comm, message, payload) {
		const size = payload.length;
		let offset = 0;
		const buffer = new UInt8Array(size+4);
		
		if (comm.conf.getSizeAscii()) {
			const strSize = size.toString().padStart(4, "0");
			offset = Comm.pack(buffer, offset, strSize.length(), strSize.getBytes());
		} else {
			offset = Comm.pack(buffer, offset, 2, comm.conf.getEndianType(), size);
		}
		
		offset = Comm.pack(buffer, offset, payload.length, payload);
		comm.os.write(buffer, 0, offset);
	}

	receive(comm, message, payload) {
		const size = {};

		if (comm.conf.getSizeAscii()) {
			const readen = comm.is.read(payload, 0, 4);

			if (readen != 4) {
				throw new IOException("CommAdapterSizePayload.read : Invalid size len received");
			}

			const strSize = new String(payload, 0, 4, "ISO-8859-1");
			size.value = Integer.parseInt(strSize);
		} else {
			Comm.unpack(comm.is, payload, 0, 2, comm.conf.getEndianType(), size);
		}

		if (size.value > 0 && size.value < payload.length) {
			const readen = comm.is.read(payload, 0, size.value);

			if (readen != size.value) {
				throw new IOException("CommAdapterSizePayload.read : Invalid size len received");
			}

			rc = size.value;
		}

		return rc;
	}

	setup(paramsSend, paramsReceive) {
	}

}

export {CommAdapterSizePayload};
