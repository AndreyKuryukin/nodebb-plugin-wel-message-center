'use strict';
/* globals module, require */

const io = require('socket.io');
const http = require('http');
const cookie = require('cookie');
const jwt = require('jsonwebtoken');
const async = require('async');
const _ = require('lodash');

const winston = module.parent.require('winston');

const User = require.main.require('./src/user');
const Notifications = require.main.require('./src/notifications');
const Topics = require.main.require('./src/topics');
const Categories = require.main.require('./src/categories');
const Meta = require.main.require('./src/meta');

const ALLOWED_TYPES = [
	'new-reply',
	'mention'
];

const DEFAULT_SETTINGS = {
	mentors: '5',
	students: '6',
	port: 8088,
	path: '/messageCenter'
};

const TID_ROOTID_LESSON_CACHE = {};

const plugin = {
	settings: {},
	sockets: {}
};

async function getRootAndLesson(tid) {
	if (TID_ROOTID_LESSON_CACHE[tid]) {
		return TID_ROOTID_LESSON_CACHE[tid];
	}
	let cid = await Topics.getTopicField(tid, 'cid');
	const result = {rootId: cid};
	while (parseInt(cid, 10)) {
		result.rootId = cid;
		const {parentCid, name} = await Categories.getCategoryFields(cid, ['parentCid', 'name']);
		if (!result.lesson && name) {
			result.lesson = name
		}
		cid = parentCid;
	}
	TID_ROOTID_LESSON_CACHE[tid] = result;
	return result;
}

async function enrich(notifications = []) {
	const roots = _.pick(plugin.settings, ['mentors', 'students']);
	return Promise.all(notifications.map(async notification => {
		const {rootId, lesson} = await getRootAndLesson(notification.tid);
		notification.root = _.findKey(roots, id => id === String(rootId));
		notification.lesson = lesson;
		return notification;
	}))

}

async function mapNotifications(notifications) {
	return enrich(notifications);
}

function filterByTypes(notifications) {
	return notifications.filter((notif) => ALLOWED_TYPES.includes(notif.type))
}

function emitUnread(socket, uid) {
	User.notifications.get(uid)
		.then(({unread = []} = {}) => filterByTypes(unread))
		.then(unread => mapNotifications(unread))
		.then(notifications => {
			socket.emit('unread', {unread: _.uniqBy(notifications, n => n.pid ? n.pid : n.nid)});
		})
}

plugin.onNewNotification = async function (data = {}) {
	const {uids, notification} = data;
	if (uids && uids.length && notification) {
		const sockets = _.pick(plugin.sockets, uids);
		if (sockets && !_.isEmpty(sockets)) {
			const unread = await enrich([notification]);
			Object.values(sockets).forEach(sock => sock.emit('unread.new', {unread: unread[0]}));
		}
	}
};

function findUser(userData, callback) {
	if (userData.email && userData.email.length) {
		User.getUidByEmail(userData.email)
			.then(uid => {
				if (uid) {
					return User.bans.isBanned(uid).then((banned) => {
						callback(banned ? null : uid)
					});
				}
				callback(null)
			})
	}
}

function processSession(token, callback) {
	async.waterfall([
		async.apply(jwt.verify, token, _.get(plugin, 'settings.sessionSharingSettings.secret')),
		async.apply(findUser),
	], callback);
}

function handleSocket(socket) {
	const cookies = cookie.parse(_.get(socket, 'handshake.headers.cookie'));
	const cookieName = _.get(plugin, 'settings.sessionSharingSettings.cookieName');
	const sessionCookie = cookies[cookieName];
	processSession(sessionCookie, function (uid) {
		if (!uid) {
			socket.disconnect();
			return;
		}
		emitUnread(socket, uid);

		socket.on('unread.get', () => emitUnread(socket, uid));

		socket.on('markRead', (nid, res) => {
			Notifications.markRead(nid, uid)
				.then(() => emitUnread(socket, uid))
		});

		socket.on('markAllRead', (notifications) => {
			Notifications.markAllRead(uid)
				.then(() => emitUnread(socket, uid))
		});

		socket.on("disconnect", () => {
			delete plugin.sockets[uid];
		});
		plugin.sockets[uid] = socket;
	});
}

function startServer({port, path}) {
	try {
		const httpServer = http.createServer();
		const socketIoServer = io(httpServer, {
			path
		});
		httpServer.listen(port);
		socketIoServer.on("connection", (socket) => {
			handleSocket(socket);
		});
		return socketIoServer;
	} catch (e) {
		winston.error(e);
		return null;
	}
}

plugin.reloadSettings = function (callback) {
	if (typeof callback !== 'function') {
		return;
	}

	Meta.settings.get('session-sharing', function (err, sessionSharingSettings) {
		if (err) {
			return callback(err);
		}

		plugin.settings = {
			...DEFAULT_SETTINGS,
			...plugin.settings,
			sessionSharingSettings
		};

		plugin.ready = true;
		winston.info('[message-center] Settings OK');
		if (plugin.server) {
			plugin.server.close()
		} else {
			plugin.server = startServer( _.pick(plugin.settings, ['port', 'path']));
		}
		callback();
	});
};

plugin.init = function (params, callback) {
	plugin.reloadSettings(callback);
};

module.exports = plugin;