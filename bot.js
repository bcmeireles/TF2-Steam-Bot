const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp');
const SteamCommunity = require('steamcommunity');
const TradeOfferManager = require('steam-tradeoffer-manager');

const secrets = require('./2fasecrets.json');
let messageLog = {};
let users = {};

const client = new SteamUser();
const community = new SteamCommunity();
const manager = new TradeOfferManager({
	steam: client,
	community: community,
	language: 'en'
});

const logOnOptions = {
  accountName: secrets.username,
  password: secrets.password,
  twoFactorCode: SteamTotp.generateAuthCode(secrets.shared_secret)
};

client.logOn(logOnOptions);

client.on('loggedOn', () => {
  console.log('Logged into Steam');

  client.setPersona(SteamUser.EPersonaState.Online);
  client.gamesPlayed("Testing");
});

client.on('webSession', (sessionid, cookies) => {
    manager.setCookies(cookies);
  
    community.setCookies(cookies);
    community.startConfirmationChecker(10000, secrets.identity_secret);
});


client.on('friendRelationship', (steamid, relationship) => {
    if (relationship === 2) {
      client.addFriend(steamid);
      client.chatMessage(steamid, 'Hello there! Thanks for adding me!');
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
            keys_bought: 0
        };
    }
    console.log(`Message from ${steamid}: ${message}`);

    if (message === '!commands') {
        client.chatMessage(steamid, 'Hello! I am a bot that buys and sells TF2 keys for crypto!');
        client.chatMessage(steamid, '/code <--------------------------- General Commands --------------------------->\n\n \
            !owner - Get the owner of the bot\n \
            !rate - Get the current rate of the bot\n \
            !stats - Get all bot related stats\n \
            !coins - Get a list of all the coins the bot uses\n \
            !fees - Get the current transactions fees for ech coin');

        client.chatMessage(steamid, '/code <--------------------------- Buying Commands --------------------------->\n\n \
        !buy <amount> <coin> - Buy the amount of keys using the coin');

        client.chatMessage(steamid, '/code <--------------------------- Selling Commands --------------------------->\n\n \
        !sell <amount> <coin> - Sell the amount of keys for the coin');
    }
});


manager.on('newOffer', offer => {
    if (offer.itemsToGive.length === 0) {
        offer.accept((err, status) => {
          if (err) {
            console.log(err);
          } else {
            console.log(`Donation accepted. Status: ${status}.`);
          }
        });

    } else if (offer.partner.getSteamID64() === 'your_trusted_account_id') {
        offer.accept((err, status) => {
            if (err) {
                console.log(err);
            } else {
                console.log(`Owner offer accepted. Status: ${status}.`);
            }
        });
    
    } else {
        offer.decline(err => {
            if (err) {
                console.log(err);
            } else {
                console.log('Offer declined.');
            }
        });
    }
  });


function sendTF2Key(partner_steam_id) {
    manager.loadInventory(440, 2, true, (err, inventory) => {
        if (err) {
            console.log(err);
        } else {
            const offer = manager.createOffer(partner_steam_id);
            const keys = inventory.filter(item => item.market_hash_name === 'Mann Co. Supply Crate Key');
f
            if (keys.length >= keyQuantity) {
                for (let i = 0; i < keyQuantity; i++) {
                    offer.addMyItem(keys[i]);
                }
                offer.setMessage(`Here are the ${keyQuantity} keys you purchased.`);
                offer.send((err, status) => {
                    if (err) {
                        console.log(err);
                    } else {
                        console.log(`Offer for ${keyQuantity} sent to ${partner_steam_id}. Status: ${status}.`);
                    }
                });
            } else {
                console.log('Not enough keys in the inventory.');
            }
        }
    });
}