# rufs-iso8583router-es6
Javascript ES6+ ISO8583 compliance financial messages router, using openapi and rest fullstack utilities (RUFS)

You need NodeJs installed and PostgreSql server already running with your database.

## First Step

Open terminal and clone this repository with `git clone https://github.com/alexsandrostefenon/rufs-iso8583router-es6`.

Requires NodeJs version >= 12.22.0 :
`
curl https://raw.githubusercontent.com/creationix/nvm/master/install.sh | bash;
[restart terminal]
nvm install '12.22';
node_version=$(nvm current);
ln -s $HOME/.nvm/versions/node/$node_version/bin/node $HOME/.nvm/versions/node/$node_version/bin/nodejs;
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
PGHOST=localhost PGUSER=development PGPASSWORD=123456 psql iso8583router_development -c "DROP DATABASE IF EXISTS iso8583router;";

PGHOST=localhost PGUSER=development PGPASSWORD=123456 psql iso8583router_development -c "CREATE DATABASE iso8583router;";

#Execute rufs-proxy to load and start microservices :

PGHOST=localhost PGUSER=development PGPASSWORD=123456 PGDATABASE=iso8583router nodejs ./rufs-base-es6/proxy.js --add-modules ../rufs-iso8583router-es6/ISO8583RouterMicroService.js;

## Web application

In EcmaScript2017 compliance browser open url

`http://localhost:8080/iso8583router`

For custom service configuration or user edition, use user 'admin' with password 'admin'.
