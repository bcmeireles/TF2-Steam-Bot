const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp');
const SteamCommunity = require('steamcommunity');
const TradeOfferManager = require('steam-tradeoffer-manager');

const axios = require('axios');

const secrets = require('./2fasecrets.json');
let messageLog = {};
let users = {};
const botStats = {
    keys_sold: 1,
    keys_bought: 2,
    sold: 1.80,
    spent: 3.40
}
const owner_account_id = '76561199356766788'

const client = new SteamUser();
const community = new SteamCommunity();
const manager = new TradeOfferManager({
	steam: client,
	community: community,
	language: 'en',
    pollInterval: 10000
});

const logOnOptions = {
  accountName: secrets.username,
  password: secrets.password,
  twoFactorCode: SteamTotp.generateAuthCode(secrets.shared_secret),
  logonID: 2
};

let errorID = 0;


client.logOn(logOnOptions);

client.on('loggedOn', () => {
  console.log('Logged into Steam');

  client.setPersona(SteamUser.EPersonaState.Online);
  client.gamesPlayed("Testing");

  
});

client.on('webSession', (sessionid, cookies) => {
    manager.apiKey = secrets.steam_api_key;

    manager.setCookies(cookies);
  
    community.setCookies(cookies);
    community.startConfirmationChecker(10000, secrets.identity_secret);
});

client.on('accountLimitations', function (limited, communityBanned, locked) {
    if (limited) {
        console.warn("Our account is limited. We cannot send friend invites, use the market, open group chat, or access the web API.");
    }
    if (communityBanned){
        console.warn("Our account is banned from Steam Community");
    }
    if (locked){
        console.error("Our account is locked. We cannot trade/gift/purchase items, play on VAC servers, or access Steam Community.  Shutting down.");
        process.exit(1);
    }
});

client.on('friendRelationship', (steamid, relationship) => {
    if (relationship === 2) {
      client.addFriend(steamid);
      client.chatMessage(steamid, 'Hello! I am a bot that buys and sells TF2 keys for crypto! Use !commands to see what I can do!');
    }
  });


client.on('groupRelationship', (sid, relationship) => {
    client.respondToGroupInvite(sid, false);
    console.log(`Declined group invite from: ${sid}`);
});


client.on('friendMessage', (steamid, message) => {
    if (users[steamid]) {
        users[steamid].messages.push(message);
    } else {
        users[steamid] = {
            messages: [message],
            last_message: Date.now(),
            keys_sold: 0,
            keys_bought: 0,
            sold: 0.0,
            spent: 0.0
        };
    }
    console.log(`Message from ${steamid}: ${message}`);

    if (message === '!commands') {
        
        client.chatMessage(steamid, '/code <--------------------------- General Commands --------------------------->\n\n \
            !owner - Get the owner of the bot\n \
            !rate - Get the current rate of the bot\n \
            !stats - Get all bot related stats\n \
            !coins - Get a list of all the coins the bot uses\n \
            !fees - Get the current transactions fees for ech coin\n \
            !stock - Get the current stock of the bot\n \
            !discord - Discord server for support and updates');

        client.chatMessage(steamid, '/code <--------------------------- Buying Commands --------------------------->\n\n \
        !buy <amount> - Buy the amount of keys');

        client.chatMessage(steamid, '/code <--------------------------- Selling Commands --------------------------->\n\n \
        !sell <amount> <coin> - Sell the amount of keys for the coin');
    }

    else if (message === '!owner') {
        client.chatMessage(steamid, `My owner is: https://steamcommunity.com/profiles/${owner_account_id}`);
    }

    else if (message === '!rate') {
        client.chatMessage(steamid, `I\'m currently buying keys for ${secrets.tf2_key_buy_rate} and selling for ${secrets.tf2_key_sell_rate} each`);
    }

    else if (message === '!stats') {
        client.chatMessage(steamid, `/code <--------------------------- Bot Stats --------------------------->\n\n \
                        Total Keys Sold: ${botStats.keys_sold}\n \
                        Total Keys Bought: ${botStats.keys_bought}\n \
                        Total Sold: $${botStats.sold}\n \
                        Total Bought: $${botStats.spent}`)

        client.chatMessage(steamid, `/code <------------------------- Personal Stats ------------------------->\n\n \
                        Total Keys Sold: ${users[steamid].keys_sold}\n \
                        Total Keys Bought: ${users[steamid].keys_bought}\n \
                        Total Sold: $${users[steamid].sold}\n \
                        Total Bought: $${users[steamid].spent}`)
    }

    else if (message === '!coins') {}

    else if (message === '!fees') {}

    else if (message === '!stock') {
        axios.get('http://localhost:3000/stock').then((response) => {
                client.chatMessage(steamid, `I currently have ${response.data.tf2keys} keys in stock`);
            })
            .catch((error) => {
                //console.log(error);
                errorFoundContactSupport(steamid, error, 'stock')
            });
    }

    else if (message === '!discord') {
        client.chatMessage(steamid, 'https://discord.gg/B7F2NwVHcV');
    }

    else if (message.startsWith('!send') && steamid.toString() === owner_account_id) {
        axios.post('http://localhost:3000/sendtf2keys', 
        {
            partner_steam_id: message.split(" ")[1],
            keyQuantity: message.split(" ")[2]
        })
        .then((response) => {
            console.log(response.data);
            client.chatMessage(steamid, 'Keys sent!');
        })
        .catch((error) => {
            console.log(error);
            errorFoundContactSupport(steamid, error, 'sendTF2Keys')
        });
    }

    else if (message.startsWith('!buy')) {
        axios.get(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${secrets.steam_api_key}&steamids=${steamid.toString()}`)
        .then((response) => {
            let avatar = response.data.response.players[0].avatarfull;
        

        axios.post('http://localhost:3000/createcharge', 
        {
            steamid: steamid.toString(),
            keyQuantity: message.split(" ")[1],
            origin: 'steam'
        })
        .then((response) => {
            console.log(response.data);
            client.chatMessage(steamid, `Please pay here: ${response.data.hosted_url}`);
            axios.post(secrets.discord_webhook, {
                "content": null,
                "embeds": [
                  {
                    "title": `New Charge: ${response.data.hosted_url.split("/").pop()}`,
                    "url": response.data.hosted_url,
                    "color": 16776960,
                    "fields": [
                      {
                        "name": "Amount",
                        "value": message.split(" ")[1],
                        "inline": true
                      },
                      {
                        "name": "Price",
                        "value": (parseInt(message.split(" ")[1]) * secrets.tf2_key_sell_rate).toString(),
                        "inline": true
                      }
                    ],
                    "author": {
                      "name": steamid.toString(),
                      "url": `https://steamcommunity.com/profiles/${steamid.toString()}`,
                      "icon_url": avatar
                    }
                  }
                ],
                "attachments": []
              })
            })
            .catch((error) => {
                errorFoundContactSupport(steamid, error, 'createCharge 1')
            });
        })
        .catch((error) => {
            errorFoundContactSupport(steamid, error, 'createCharge 2')
        });
    }

    else if (message.startsWith('!test') ) {
        errorFoundContactSupport(steamid, 'testing', 'test')
    }
});




function errorFoundContactSupport(steamid, message, where) {
    errorID += 1;
    axios.post(secrets.discord_webhook, {
        "content": message,
        "embeds": [
          {
            "title": `Error #${errorID.toString()}`,
            "color": 16711680,
            "fields": [
              {
                "name": "Where",
                "value": where
              }
            ],
            "author": {
              "name": steamid.toString(),
              "url": `https://steamcommunity.com/profiles/${steamid.toString()}`,
            }
          }
        ],
        "attachments": []
    }).then((response) => {
        console.log(response.data);
    })

    client.chatMessage(steamid, `There was an error processing your request. Please contact support with the error ID: ${errorID.toString()}. If you are not a member of the discord server type !discord or add my owner on steam (!owner)`);
}




