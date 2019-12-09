'use strict';
/* globals module, require */

const io = require('socket.io');
const http = require('http');

const cookie = require('cookie');
const jwt = require('jsonwebtoken');
const async = require('async');
const _ = require('lodash');


const User = require.main.require('./src/user');
const meta = require.main.require('./src/meta');
const db = require.main.require('./src/database');

var winston = module.parent.require('winston');


const plugin = {
	settings: {}
};

plugin.process = function (token, callback) {
	async.waterfall([
		async.apply(jwt.verify, token, plugin.settings.sessionSharingSettings.secret),
		async.apply(plugin.findUser),
	], callback);
};

plugin.findUser = function (userData, callback) {
	var queries = {};
	if (userData.email && userData.email.length) {
		queries.mergeUid = async.apply(db.sortedSetScore, 'email:uid', userData.email);
	}
	queries.uid = async.apply(db.sortedSetScore, plugin.settings.sessionSharingSettings.name + ':uid', userData.id);

	async.parallel(queries, function (err, checks) {
		if (err) {
			return callback(err);
		}
		async.waterfall([
			/* check if found something to work with */
			function (next) {
				if (checks.uid && !isNaN(parseInt(checks.uid, 10))) {
					var uid = parseInt(checks.uid, 10);
					/* check if the user with the given id actually exists */
					return User.exists(uid, function (err, exists) {
						/* ignore errors, but assume the user doesn't exist  */
						if (err) {
							winston.warn('[message-center] Error while testing user existance', err);
							return next(null, null);
						}
						if (exists) {
							return next(null, uid);
						}
						db.sortedSetRemove(plugin.settings.sessionSharingSettings.name + ':uid', userData.id, function (err) {
							next(err, null);
						});
					});
				}
				if (checks.mergeUid && !isNaN(parseInt(checks.mergeUid, 10))) {
					winston.info('[session-sharing] Found user via their email, associating this id (' + userData.id + ') with their NodeBB account');
					return next(err, parseInt(checks.mergeUid, 10));
				}
				setImmediate(next, null, null);
			},
		], callback);
	});
};


function handleSocket(socket) {
	const cookies = cookie.parse(socket.handshake.headers.cookie);
	const {cookieName} = plugin.settings.sessionSharingSettings;
	const session = cookies[cookieName];
	plugin.process(session, function (err, userData) {
		if (err || !userData) {
			return;
		}
		const {id, username, email} = userData;

	});

	socket.on('message', (args) => {
	});
	socket.on("disconnect", () => {
	});
}

plugin.reloadSettings = function (callback) {
	if (typeof callback !== 'function') {
		return;
	}

	meta.settings.get('session-sharing', function (err, sessionSharingSettings) {
		if (err) {
			return callback(err);
		}

		plugin.settings = {
			...plugin.settings,
			sessionSharingSettings
		};

		plugin.ready = true;
		callback();
	});
};

//todo: move to settings page;
function startServer(port = 8088, path) {
	const httpServer = http.createServer();
	const socketIoServer = io(httpServer, {
		path,
		serveClient: false,
		pingInterval: 10000,
		pingTimeout: 5000,
		cookie: true
	});
	httpServer.listen(port);
	return socketIoServer;
}


plugin.init = function (params, callback) {

	const server = startServer();
	server.on("connection", (socket) => {
		handleSocket(socket);
	});
	plugin.reloadSettings(callback);
};

module.exports = plugin;