'use strict';
/* globals module, require */

const socket =  require.main.require('src/socket.io');
	const plugin = {};
plugin.init = function (data, callback) {
	callback();
};


module.exports = plugin;