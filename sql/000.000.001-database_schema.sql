DROP TABLE IF EXISTS connector;
DROP TABLE IF EXISTS message_adapter_conf_item;
DROP TABLE IF EXISTS message_adapter_conf;

CREATE TABLE message_adapter_conf (
	name varchar(255) primary key,
	parent varchar(255),
	adapter varchar(255),
	tag_prefix varchar(255),
	compress boolean default false
);

CREATE TABLE message_adapter_conf_item (
	id integer primary key,
	message_adapter_conf varchar,
	field_name varchar,
	tag varchar,
	min_length integer,
	max_length integer,
	size_header integer,
	root_pattern varchar,
	data_type integer,
	alignment integer,
	foreign key (message_adapter_conf) references message_adapter_conf (name)
);

CREATE TABLE comm_conf (
	name varchar(255) not null primary key,
	adapter varchar(255),
	backlog integer,
	direction integer,
	enabled boolean,
	endian_type integer,
	ip varchar(255),
	listen boolean,
	max_opened_connections integer, 
	message_adapter_conf varchar(255), 
	permanent boolean, 
	port integer, 
	size_ascii boolean,
	foreign key (message_adapter_conf) references message_adapter_conf (name)
);
