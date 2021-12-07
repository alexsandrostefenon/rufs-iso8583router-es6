INSERT INTO message_adapter_conf (name) values ('iso8583default');

INSERT INTO message_adapter_conf_item
(id, field_name, tag, min_length, max_length, size_header,root_pattern,message_adapter_conf,data_type)
values
(1, 'msgType', '0', 4, 4, 0, '\\d\\d\\d\\d_\\d\\d\\d\\d\\d\\d', 'iso8583default', 1),
(2, 'pan', '2', 12, 16, 0, '\\d\\d\\d\\d_\\d\\d\\d\\d\\d\\d', 'iso8583default', 1),
(3, 'codeProcess', '3', 6, 6, 0, '\\d\\d\\d\\d_\\d\\d\\d\\d\\d\\d', 'iso8583default', 1),
(4, 'transactionValue', '4', 12, 12, 0, '\\d\\d\\d\\d_\\d\\d\\d\\d\\d\\d', 'iso8583default', 1),
(11, 'captureNsu', '11', 6, 6, 0, '\\d\\d\\d\\d_\\d\\d\\d\\d\\d\\d', 'iso8583default', 1),
(42, 'captureEc', '42', 15, 15, 0, '\\d\\d\\d\\d_\\d\\d\\d\\d\\d\\d', 'iso8583default', 1),
(41, 'equipamentId', '41', 8, 8, 0, '\\d\\d\\d\\d_\\d\\d\\d\\d\\d\\d', 'iso8583default', 1),
(67, 'numPayments', '67', 2, 2, 0, '\\d\\d\\d\\d_\\d\\d\\d\\d\\d\\d', 'iso8583default', 1)
;

INSERT INTO comm_conf (message_adapter_conf, adapter, backlog, direction, enabled, endian_type, ip, listen, max_opened_connections, name, permanent, port, size_ascii) VALUES ('iso8583default', 'CommAdapterPayload', 50, 0, true, 1, 'localhost', true, 1, 'POS-test', true, 2001, false);
INSERT INTO comm_conf (message_adapter_conf, adapter, backlog, direction, enabled, endian_type, ip, listen, max_opened_connections, name, permanent, port, size_ascii) VALUES ('iso8583default', 'CommAdapterSizePayload', 50, 0, true, 1, 'localhost', true, 1, 'TEF-test', true, 2002, true);
INSERT INTO comm_conf (message_adapter_conf, adapter, backlog, direction, enabled, endian_type, ip, listen, max_opened_connections, name, permanent, port, size_ascii) VALUES ('iso8583default', 'CommAdapterSizePayload', 50, 2, true, 1, 'localhost', false, 1, 'MASTERCARD-test', true, 3001, true);

INSERT INTO comm_conf (message_adapter_conf, adapter, backlog, direction, enabled, endian_type, ip, listen, max_opened_connections, name, permanent, port, size_ascii) VALUES ('iso8583default', 'CommAdapterPayload', 50, 1, true, 1, 'localhost', false, 1, 'POS-test-emu', true, 2001, false);
INSERT INTO comm_conf (message_adapter_conf, adapter, backlog, direction, enabled, endian_type, ip, listen, max_opened_connections, name, permanent, port, size_ascii) VALUES ('iso8583default', 'CommAdapterSizePayload', 50, 1, true, 1, 'localhost', false, 1, 'TEF-test-emu', true, 2002, true);
INSERT INTO comm_conf (message_adapter_conf, adapter, backlog, direction, enabled, endian_type, ip, listen, max_opened_connections, name, permanent, port, size_ascii) VALUES ('iso8583default', 'CommAdapterSizePayload', 50, 0, true, 1, 'localhost', true, 1, 'MASTERCARD-test-emu', true, 3001, true);
