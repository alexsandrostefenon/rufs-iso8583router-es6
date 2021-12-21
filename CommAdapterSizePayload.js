import {Comm} from "./Comm.js"

class CommAdapterSizePayload {

	send(comm, message, payload) {
		return new Promise((resolve, reject) => {
			const size = payload.length;
			let offset = 0;
			const buffer = new Uint8Array(size+4);

			if (comm.conf.sizeAscii == true) {
				const strSize = size.toString().padStart(4, "0");
				const bufferStrSize = new TextEncoder().encode(strSize);
				offset = Comm.pack(buffer, offset, strSize.length, bufferStrSize);
			} else {
				offset = Comm.packInt(buffer, offset, 2, comm.conf.endianType, size);
			}

			offset = Comm.pack(buffer, offset, payload.length, payload);
			comm.socket.write(buffer, () => resolve());
		});
	}

	receive(comm, message, payload) {
		let size = 0;

		if (comm.conf.sizeAscii == true) {
			if (comm.bufferReceiveOffset < 4) return -1;
			const str = new TextDecoder("utf-8").decode(comm.bufferReceive.slice(0, 4));//"ISO-8859-1");
			size = Number.parseInt(str);
		} else {
			const view = new DataView(comm.bufferReceive.buffer, 0);
			size = view.getUint16(0, true); // true here represents little-endian of comm.conf.endianType
		}

		if (comm.bufferReceiveOffset < (4 + size)) return -1;
		for (let i = 0; i < size; i++) comm.bufferReceive[i] = comm.bufferReceive[i+4];
		comm.bufferReceiveOffset -= 4;
		return size;
	}

}

export {CommAdapterSizePayload};
