'use strict';

/* globals define, $, app, socket, config */

define('admin/plugins/message-center', ['settings'], function (Settings) {
	var ACP = {};

	ACP.init = function () {
		Settings.load('message-center', $('.message-center-settings'));

		$('#save').on('click', function () {
			Settings.save('message-center', $('.message-center-settings'), function () {
				app.alert({
					type: 'success',
					alert_id: 'message-center-saved',
					title: 'Settings Saved',
					message: 'No restart/reload is required',
					timeout: 5000,
				});
			});
		});

		$('#search').on('keyup', ACP.showUserId);
		$('#remote_search').on('keyup', ACP.findUserByRemoteId);
	};

	ACP.showUserId = function () {
		if (ACP._searchDelay) {
			clearTimeout(ACP._searchDelay);
			delete ACP._searchDelay;
		}

		var element = $(this);

		ACP._searchDelay = setTimeout(function () {
			delete ACP._searchDelay;

			socket.emit('admin.user.search', {
				query: element.val(),
			}, function (err, results) {
				var resultEl = $('#result');

				if (err) {
					return resultEl.text('We encountered an error while servicing this request:' + err.message);
				}

				if (results.users.length) {
					socket.emit('plugins.messageCenter.showUserIds', {
						uids: results.users.map(function (user) {
							return user.uid;
						}),
					}, function (err, remoteIds) {
						if (err) {
							resultEl.text('We encountered an error while servicing this request:' + err.message);
						} else {
							resultEl.empty();
							results.users.forEach(function (userObj, idx) {
								resultEl.append('<p>Username: ' + userObj.username + '<br />NodeBB uid: ' + userObj.uid + '<br />Remote id: ' + (remoteIds[idx] || '<em>Not Found</em>'));
							});
						}
					});
				} else {
					resultEl.text('No users matched your query');
				}
			});
		}, 500);
	};

	ACP.findUserByRemoteId = function () {
		if (ACP._searchDelay) {
			clearTimeout(ACP._searchDelay);
			delete ACP._searchDelay;
		}

		var element = $(this);

		ACP._searchDelay = setTimeout(function () {
			delete ACP._searchDelay;

			socket.emit('plugins.messageCenter.findUserByRemoteId', {
				remoteId: element.val(),
			}, function (err, results) {
				if (!err && results) {
					$('#local_result').html(
						'<div class="media"><div class="media-left"><a target="_blank" href="' + config.relative_path + '/user/' + results.userslug + '">' +
						(results.picture ? '<img class="media-object avatar avatar-sm" src="' + results.picture + '" alt="Profile Picture">' : '<div class="avatar avatar-sm" style="background-color: ' + results['icon:bgColor'] + ';">' + results['icon:text'] + '</div>') +
						'</a></div>' +
						'<div class="media-body"><a target="_blank" href="' + config.relative_path + '/user/' + results.userslug + '">' + results.username + '</a></div></div>');
				} else {
					$('#local_result').text('No users were found associated with that remote ID');
				}
			});
		}, 500);
	};

	return ACP;
});