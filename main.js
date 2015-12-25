#!/usr/bin/env node

// Total hours wasted here -> 12
// ^ Do Not Remove This!

'use strict';


var Telegram = require('telegram-bot');
var IRC = require('irc');
var config = require('./config.js');
var pvimcn = require('./pvimcn.js');


var tg = new Telegram(config.tg_bot_api_key);
var client = new IRC.Client(config.irc_server, config.irc_nick, {
    channels: [config.irc_channel],
    sasl: config.irc_sasl,
    secure: config.irc_ssl,
    selfSigned: config.irc_ssl_self_signed,
    port: config.irc_port,
    username: config.irc_username,
    password: config.irc_password,
    floodProtection: true,
    floodProtectionDelay: 1000
});
var tgid, tgusername;
var enabled = true;
var blocki2t = new Array();
var blockt2i = new Array();
var msgfilter = function (s) { return s; };


function printf(args) {
    var string = arguments[0];
    /* note that %n in the string must be in ascending order */
    /* like 'Foo %1 Bar %2 %3' */
    var i;
    for(i=arguments.length-1; i>0; i--)
        string = string.replace('%'+i, arguments[i]);
    return string;
}


function format_name(first_name, last_name) {
    var full_name = last_name?
        first_name + ' ' + last_name:
        first_name;
    if(full_name.length > 20)
        full_name = full_name.slice(0, 20);
    return full_name;
}


function format_newline(text, user, target, type) {
    text = text.replace(/(\s*\n\s*)+/g, '\n');
    if(type == 'reply')
        return text.replace(/\n/g, printf('\n[%1] %2: ', user, target));
    if(type == 'forward')
        return text.replace(/\n/g, printf('\n[%1] Fwd %2: ', user, target));
    return text.replace(/\n/g, printf('\n[%1] ', user));
}


// Event to write config on exit.
process.on('SIGINT', function(code) {
    console.log('About to exit with code:', code);
    client.part(config.irc_channel);
    process.exit();
});
// End Exit Event.


client.addListener('message' + config.irc_channel, function (from, message) {
    console.log(printf('From IRC %1  --  %2', from, message));

    // Blocking Enforcer
    if (blocki2t.indexOf(from) > -1 || !enabled)
        return;

    // say last context to irc
    if (message.match(/\s*\\last\s*/)){
	var last_msg = printf('Replied %1: %2', lastContext.name, lastContext.text);
	client.say(config.irc_channel, last_msg);
        console.log(last_msg);
        return;
    }

    if(config.other_bridge_bots.indexOf(from) == -1)
        message = printf('[%1] %2', from, message);
    tg.sendMessage({
        text: message,
        chat_id: config.tg_group_id
    });
});


client.addListener('action', function (from, to, text) {
    console.log(printf('From IRC Action %1  --  %2', from, text));

    // Blocking Enforcer
    if (blocki2t.indexOf(from) > -1 || !enabled)
        return;

    if(to == config.irc_channel){
        if(config.other_bridge_bots.indexOf(from) == -1)
            text = printf('** [%1] %2 **', from, text);
        else
            text = printf('** %1 **', text);
        tg.sendMessage({
            text: text,
            chat_id: config.tg_group_id
        });
    }
});

// record last reply context
var lastContext = {name:'', text:''};

tg.on('message', function(msg) {
    // Process Commands.
    console.log(printf('From ID %1  --  %2', msg.chat.id, msg.text));
    if(config.irc_photo_forwarding_enabled && msg.photo){
        var largest = {file_size: 0};
        for(var i in msg.photo){
            var p = msg.photo[i];
            if(p.file_size > largest.file_size){
                largest = p;
            }
        }
        tg.getFile({file_id: largest.file_id}).then(function (ret){
            if(ret.ok){
                var url = printf('https://api.telegram.org/file/bot%1/%2',
                    config.tg_bot_api_key, ret.result.file_path);
                pvimcn.imgvim(url, function(err,ret){
                    console.log(ret);
                    var user = format_name(msg.from.first_name, msg.from.last_name);
                    client.say(config.irc_channel, printf('[%1] Img: %2', user,ret));
                });
            }
        });
    } else if (msg.text && msg.text.slice(0, 1) == '/') {
        var command = msg.text.split(' ');
        if (command[0] == '/hold' || command[0] == '/hold@' + tgusername) {
            tg.sendMessage({
                text: '阿卡林黑洞已关闭！',
                chat_id: msg.chat.id
            });
            enabled = false;
            return;
        } else if (command[0] == '/unhold' || command[0] == '/unhold@' + tgusername) {
            tg.sendMessage({
                text: '阿卡林黑洞已开启！',
                chat_id: msg.chat.id
            });
            enabled = true;
            return;
        } else if (command[0] == '/blocki2t' || command[0] == '/blocki2t@' + tgusername) {
            if (command[1] && blocki2t.indexOf(command[1]) == -1) {
                blocki2t.push(command[1]);
                tg.sendMessage({
                    text: 'Temporary Blocked ' + command[1] + ' From IRC to Telegram!',
                    chat_id: msg.chat.id
                });
            } else {
                tg.sendMessage({
                    text: 'Nickname Unspecified!',
                    chat_id: msg.chat.id
                });
            }
            return;
        } else if (command[0] == '/blockt2i' || command[0] == '/blockt2i@' + tgusername) {
            if (msg.reply_to_message && blockt2i.indexOf(msg.reply_to_message.from.id) == -1) {
                blockt2i.push(msg.reply_to_message.from.id);
                tg.sendMessage({
                    text: 'Temporary Blocked ' + msg.reply_to_message.from.username + ' From Telegram to IRC!',
                    chat_id: msg.chat.id
                });
            } else if (command[1] && !isNaN(command[1]) && blockt2i.indexOf(command[1]) == -1) {
                blockt2i.push(parseInt(command[1]));
                tg.sendMessage({
                    text: 'Temporary Blocked ' + command[1] + ' From Telegram to IRC!',
                    chat_id: msg.chat.id
                });
            } else {
                tg.sendMessage({
                    text: 'Target Unspecified!',
                    chat_id: msg.chat.id
                });
            }
            return;
        } else if (command[0] == '/unblocki2t' || command[0] == '/unblocki2t@' + tgusername) {
            if (command[1] && blocki2t.indexOf(command[1]) > -1) {
                blocki2t.splice(blocki2t.indexOf(command[1]), 1);
                tg.sendMessage({
                    text: 'Temporary Unblocked ' + command[1] + ' From IRC to Telegram!',
                    chat_id: msg.chat.id
                });
            } else {
                tg.sendMessage({
                    text: 'Nickname Unspecified!',
                    chat_id: msg.chat.id
                });
            }
            return;
        } else if (command[0] == '/unblockt2i' || command[0] == '/unblockt2i@' + tgusername) {
            if (msg.reply_to_message && blockt2i.indexOf(msg.reply_to_message.from.id) > -1) {
                blockt2i.splice(blockt2i.indexOf(msg.reply_to_message.from.id), 1);
                tg.sendMessage({
                    text: 'Temporary Unblocked ' + msg.reply_to_message.from.username + ' From Telegram to IRC!',
                    chat_id: msg.chat.id
                });
            } else if (command[1] && !isNaN(command[1]) && blockt2i.indexOf(parseInt(command[1])) > -1) {
                blockt2i.splice(blockt2i.indexOf(parseInt(command[1])), 1);
                tg.sendMessage({
                    text: 'Temporary Unblocked ' + command[1] + ' From Telegram to IRC!',
                    chat_id: msg.chat.id
                });
            } else {
                tg.sendMessage({
                    text: 'Target Unspecified!',
                    chat_id: msg.chat.id
                });
            }
            return;
        } else if (command[0] == '/reloadblocklist' || command[0] == '/reloadblocklist@' + tgusername) {
            // Load blocklist
            blocki2t = config.blocki2t;
            blockt2i = config.blockt2i;
            tg.sendMessage({
                text: 'Blocklist Reloaded!',
                chat_id: msg.chat.id
            });
            return;
        } else if (command[0] == '/ircsay' || command[0] == '/ircsay@' + tgusername) {
            var txtn;
            command.shift();
            txtn = command.join(" ");
            client.say(config.irc_channel, txtn);
            return;
        }
        return;
    }

    var user, reply_to, forward_from, message_text;

    // Message Filter
    if(!msg.text || msg.chat.id != config.tg_group_id || !enabled)
        return;

    // Blocking Enforcer
    if (blockt2i.indexOf(msg.from.id) > -1 || msg.text.slice(0, 3) == '@@@')
        return;

    user = format_name(msg.from.first_name, msg.from.last_name);
    if(msg.reply_to_message){
        if (msg.reply_to_message.from.id == tgid)
            reply_to = msg.reply_to_message.text.match(/^[\[\(<]([^>\)\]\[]+)[>\)\]]/)[1];
        else
            reply_to = format_name(msg.reply_to_message.from.first_name, msg.reply_to_message.from.last_name);
        lastContext = {
	    text: msg.reply_to_message.text,
	    name: reply_to
	};
        message_text = format_newline(msg.text, user, reply_to, 'reply');
        message_text = printf('[%1] %2: %3', user, reply_to, message_text);
    } else if (msg.forward_from){
        if(msg.forward_from.id == tgid)
            forward_from = msg.text.match(/^[\[\(<]([^>\)\]\[]+)[>\)\]]/)[1];
        else
            forward_from = format_name(msg.forward_from.first_name, msg.forward_from.last_name);
        message_text = format_newline(msg.text, user, forward_from,
				      'forward', true);
        message_text = printf('[%1] Fwd %2: %3', user, forward_from, message_text);
    } else {
	var formatted_msg_text = msg.text;
	var arr = msg.text.split('\n');
        if (arr.length > config.irc_line_count_limit ||
            arr.some(function (line){
                    return line.length > config.irc_message_length_limit;
            })){

	    if(config.irc_long_message_paste_enabled){
		console.log(printf('User [%1] send a long message', user));
		pvimcn.pvim(msg.text, function cb(err, result){
                    if(err)
			client.say(config.irc_channel,
				   printf('[%1] %2', user,
					  msg.text.replace(/\n/g, '\\n')));
                    else
			client.say(config.irc_channel,
				   printf('Long Msg [%1] %2', user, result));
		});
		return;
	    }else{
		arr.map(function (line){
		    return line.slice(0, config.irc_message_length_limit);
		});
		if(arr.length > config.irc_line_count_limit){
		    arr = arr.slice(0, config.irc_line_count_limit);
		    arr.push("(line count limit exceeded)");
		}
		formatted_msg_text = arr.join('\n');
	    }
        }
	message_text = format_newline(formatted_msg_text, user);
	message_text = printf('[%1] %2', user, message_text);
    }
    client.say(config.irc_channel, msgfilter(message_text));
    //End of the sub process.
});


client.addListener('error', function(message) {
    console.log('error: ', message);
});

// Load blocklist
blocki2t = config.blocki2t;
blockt2i = config.blockt2i;

// init message filter
if (typeof (config.tg_msg_filter) === 'function') {
    msgfilter = config.tg_msg_filter;
}

tg.start();
tg.getMe().then(function(ret){
    tgid = ret.result.id;
    tgusername = ret.result.username;
})
client.join(config.irc_channel);


console.log('卫星成功发射');
