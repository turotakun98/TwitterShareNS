// MODULES
const Twit = require('twit')
const botgram = require('botgram');
const request = require('request')
const fs = require('fs')

const configTwit = require('./configTwit')
const config = require('./config');

// GLOBAL VARIABLES
var usersId_ChatId = {}
const cacheFile = config.userCacheFile
fs.readFile(cacheFile, 'utf8', function (err, data) {
    readText = data.trim()
    if (readText[0] == ",") { readText = data.trim().substr(1, data.length) }
    usersId_ChatId = JSON.parse("{" + readText + "}")
});


var tracks = config.tracks
const telegramToken = config.telegramToken

const appName = config.app_name
const appDescription = config.app_desc

// TWITTER CLASS
const twitterBot = new Twit(configTwit)
var stream = twitterBot.stream('statuses/filter', { track: tracks })
stream.on('tweet', tweetEvent)

// TELEGRAM API
TelegramApiURL = `https://api.telegram.org/bot${telegramToken}/`
var telegramBot = botgram(telegramToken);


telegramBot.command("start", "help", function (msg, reply, next) {
    reply.html(`<strong>${appName}</strong> \n ${appDescription + tracks} \n Use the command "/Twitter Username" to specify the user. To display the current following user use the command /Twitter `);
});

telegramBot.command("Twitter", manageTwitterCommand)

// FUNCTIONS
async function manageTwitterCommand(msg, reply, next) {

    var message = "";

    text = msg.text.toLowerCase().replace('/twitter', '').trim()
    text = text.replace('@', '').trim()

    if (text) {

        //Add/Modify current chat user
        userInfo = await getTwitterUserInfo(null, text)

        //User found for the given username 
        if (userInfo.length > 0) {

            //IdUser found for the given username
            var idUser = userInfo[0]

            //Set the IdUser if already cached
            var userID = getUserIdFromChatId(msg.chat.id)

            //If the new IdUser is different from the current, notify the user of the change
            if (userID > 0 && userID != idUser) {
                message = "Current user modified: " + text
                delete usersId_ChatId[userID]
                usersId_ChatId[idUser] = msg.chat.id

                fs.readFile(cacheFile, 'utf-8', function (err, data) {
                    if (err) throw err;

                    var reg = new RegExp(".*" + userID + ".*");

                    var newValue = data.replace(reg, '') + `, "${idUser}": ${usersId_ChatId[idUser]} \r\n`;

                    fs.writeFile(cacheFile, newValue, 'utf-8', function (err) {
                        if (err) throw err;
                        console.log('Users cache file removed!');
                    });
                });

            }
            //If the new IdUser is equals to the current, notify the user that there are no changes
            else if (userID > 0 && userID == idUser) {
                message = "User already associated: " + text
            }
            //If there are not idUsers associated to the current Chat, notify the user of the new association
            else {
                message = "New user associated: " + text

                //Add the dictionary of users
                usersId_ChatId[idUser] = msg.chat.id

                //And store in the cache file
                fs.appendFile(cacheFile, `, "${idUser}": ${usersId_ChatId[idUser]} \r\n`, function (err) {
                    if (err) console.log(err.message);
                    console.log('Users cache file updated!');
                });
            }

        }
        //No user found for the given username
        else {
            message = "Specified user not found: " + text
        }
    }
    else {
        //Return current user for the given chat id or return error message
        userID = getUserIdFromChatId(msg.chat.id)

        if (userID > 0) {
            userInfo = await getTwitterUserInfo(userID, null)
            if (userInfo.length > 0) {
                message = "Current associated user: " + userInfo[0]
            }
            else {
                message = "Error with the current associated user. Reinsert with the command '/Twitter Username'"
            }
        }
        else {
            message = "No user associated with the current chat, add one with the command '/Twitter Username'"
        }
    }

    console.log("Responding to the user message with text " + message)
    reply.text(message)
}

function getUserIdFromChatId(chatID) {
    var userID = 0
    for (var usersId in usersId_ChatId) {
        if (usersId_ChatId[usersId] == chatID) {
            userID = usersId
            break
        }
    }
    return userID
}

async function getTwitterUserInfo(idUser, username) {
    var params = {}
    if (idUser) {
        params = { "user_id": idUser }
    }
    else {
        params = { "screen_name": username }
    }

    let res = await doRequestUser(params);
    console.log('Twitter user info received')

    //var ret = ((idUser) ? res[0] : res[1]);

    var ret = []
    for (let i = 0; i < res.length; i++) {
        if (idUser) {
            ret.push(res[i].screen_name)
        }
        else {
            ret.push(res[i].id_str)
        }
    }

    return ret
}

function doRequestUser(params) {
    return new Promise((result) => {
        console.log('Requesting Twitter user info')
        let response = twitterBot.get('users/lookup', params, (err, data, response) => {
            result(data)
        })
    })
}

function sendTelegramMessage(message, chatID) {

    request.post(TelegramApiURL + 'sendMessage', {
        json: {
            chat_id: chatID,
            text: message
        }
    }, (error, res, body) => {
        if (error) {
            console.error(error)
            return
        }

        console.log(`Send Telegram message statusCode: ${res.statusCode}`)
    })
}

function destroyTweet(idTweet) {
    twitterBot.post('statuses/destroy/:id', { id: idTweet }, function (err, data, response) {
        console.log('Twitter destroy tweet ' + data.id_str)
    })

    console.log(`Tweet destroyed ${idTweet} : ${getDateTime()}`)

}

function tweetEvent(eventMsg) {
    console.log('New tweet received')

    text = eventMsg.text
    userID = eventMsg.user.id_str

    if (userID in usersId_ChatId) {

        chatID = usersId_ChatId[userID]
        media = ((eventMsg.extended_entities) ? ((eventMsg.extended_entities.media) ? eventMsg.extended_entities.media : "") : "");

        if (!tracks.includes(text)) {
            console.log(`Responding in ChatId ${chatID} with message ${text}`)
            sendTelegramMessage(text, chatID)
        }

        if (media && media.length > 1) {
            for (let i = 1; i < media.length; i++) {
                imageUrl = media[i].media_url_https

                console.log(`Responding in ChatId ${chatID} with message ${imageUrl}`)
                sendTelegramMessage(imageUrl, chatID /*, destroyTweet, eventMsg.id_str*/)
            }
        }

        console.log(`Start destroy tweet ${eventMsg.id_str} : ${getDateTime()}`)

        setTimeout(function () {
            destroyTweet(eventMsg.id_str);
        }, 10000)
    }
}

function getDateTime() {
    var currentDate = new Date()
    var dateTime = currentDate.getDate() + "/"
        + (currentDate.getMonth() + 1) + "/"
        + currentDate.getFullYear() + " @ "
        + currentDate.getHours() + ":"
        + currentDate.getMinutes() + ":"
        + currentDate.getSeconds();
    return dateTime
}
