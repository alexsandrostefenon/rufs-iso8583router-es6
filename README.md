# rufs-iso8583router-es6
Javascript ES6+ ISO8583 compliance financial messages router, using openapi and rest fullstack utilities (RUFS)

You need NodeJs installed and PostgreSql server already running with your database.

## First Step

Open terminal and clone this repository with `git clone https://github.com/alexsandrostefenon/rufs-iso8583router-es6`.

Requires NodeJs version >= 12.22.0 :
`
ARCH='arm64';
ARCH='x64';
wget -c https://nodejs.org/dist/v12.22.0/node-v12.22.0-linux-$ARCH.tar.xz &&
tar -xf node-v12.22.0-linux-$ARCH.tar.xz &&
PATH=./node-v12.22.0-linux-$ARCH/bin/:$PATH;
`
Install :
`
npm install ./rufs-iso8583router-es6;
ln -s node_modules/rufs-* ./;
`
## Run Ecosystem

## PostgreSql setup

create database :

sudo su postgres;

or

su -c "su postgres";

export PGDATABASE=postgres;
psql -c "CREATE USER development WITH CREATEDB LOGIN PASSWORD '123456'";
psql -c 'CREATE DATABASE iso8583router_development WITH OWNER development';
exit;

Note, database "iso8583router_development" is only for testing purposes.

### Run Ecosystem

#Only to clean already existent configuration :

rm *openapi-iso8583router.json;

#Only to clean already existent testing data :

export PGHOST=localhost;
export PGPORT=5432;
export PGUSER=development;
export PGPASSWORD=123456;

psql iso8583router_development -c "DROP DATABASE IF EXISTS iso8583router;" &&
psql iso8583router_development -c "CREATE DATABASE iso8583router;" &&

#Execute rufs-proxy to load and start microservices :

PGHOST=localhost PGPORT=5432 PGUSER=development PGPASSWORD=123456 PGDATABASE=iso8583router nodejs ./rufs-base-es6/proxy.js --add-modules ../rufs-iso8583router-es6/ISO8583RouterMicroService.js;
#PGHOST=localhost PGPORT=5432 PGUSER=development PGPASSWORD=123456 PGDATABASE=iso8583router nodejs --inspect ./rufs-iso8583router-es6/ISO8583RouterMicroService.js;

## Web application

In EcmaScript2017 compliance browser open url

`http://localhost:8080/iso8583router`

For custom service configuration or user edition, use user 'admin' with password 'admin'.
