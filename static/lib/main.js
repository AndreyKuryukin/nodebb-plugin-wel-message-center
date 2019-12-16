'use strict';

/* globals document, $, window, config, ajaxify, bootbox */

$(document).ready(function () {
	$(window).on('action:app.loggedOut', function (evt, data) {
		if (config.messageSharing.logoutRedirect) {
			data.next = config.messageSharing.logoutRedirect;
		}
	});

	$(window).on('action:ajaxify.end', function () {
		if (config.messageSharing.loginOverride) {
			$('a[href="/login"]').off('click').on('click', loginRedirect);
		}

		if (ajaxify.data.messageSharingBan) {
			bootbox.alert({
				title: '[[error:user-banned]]',
				message: ajaxify.data.messageSharingBan.ban.expiry > 0 ?
					'[[error:user-banned-reason-until, ' + ajaxify.data.messageSharingBan.ban.expiry_readable + ', ' + ajaxify.data.messageSharingBan.ban.reason + ']]' :
					'[[error:user-banned-reason, ' + ajaxify.data.messageSharingBan.ban.reason + ']]',
			});
		}
	});

	$(window).on('action:ajaxify.start', function (e, data) {
		if (data.url.startsWith('login') && config.messageSharing.loginOverride) {
			data.url = null;
			loginRedirect(e);
		}
	});

	$(window).on('action:ajaxify.end', function (e, data) {
		if (data.url === 'login' && config.messageSharing.loginOverride) {
			$('#content').html('');
			loginRedirect(e);
		}
	});

	function loginRedirect(e) {
		e.preventDefault();
		e.stopPropagation();

		window.location.href = config.messageSharing.loginOverride;
	}

	$(window).on('action:ajaxify.end', function () {
		if (config.messageSharing.registerOverride) {
			$('a[href="/register"]').off('click').on('click', registerRedirect);
		}
	});

	$(window).on('action:ajaxify.start', function (e, data) {
		if (data.url.startsWith('register') && config.messageSharing.registerOverride) {
			data.url = null;
			registerRedirect(e);
		}
	});

	$(window).on('action:ajaxify.end', function (e, data) {
		if (data.url === 'register' && config.messageSharing.registerOverride) {
			$('#content').html('');
			registerRedirect(e);
		}
	});

	function registerRedirect(e) {
		e.preventDefault();
		e.stopPropagation();

		window.location.href = config.messageSharing.registerOverride;
	}
});