const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp');
const SteamCommunity = require('steamcommunity');
const TradeOfferManager = require('steam-tradeoffer-manager');

const express = require('express');
const app = express();
app.use(express.json());

const secrets = require('./2fasecrets.json');
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
  twoFactorCode: SteamTotp.generateAuthCode(secrets.shared_secret)
};



client.logOn(logOnOptions);

client.on('loggedOn', () => {
  console.log('Logged into Steam');

  client.setPersona(SteamUser.EPersonaState.Online);
  client.gamesPlayed("Testing");

  
});

client.on('webSession', (sessionid, cookies) => {
    manager.apiKey = secrets.api_key;

    manager.setCookies(cookies);
  
    community.setCookies(cookies);
    community.startConfirmationChecker(10000, secrets.identity_secret);
});

function sendTF2Keys(partner_steam_id, keyQuantity) {
    return new Promise((resolve, reject) => {
        manager.loadInventory(440, 2, true, (err, inventory) => {
            if (err) {
                reject(err);
            } else {
                const offer = manager.createOffer(partner_steam_id);
                const keys = inventory.filter(item => item.market_hash_name === 'Mann Co. Supply Crate Key');

                if (keys.length >= keyQuantity) {
                    for (let i = 0; i < keyQuantity; i++) {
                        offer.addMyItem(keys[i]);
                    }
                    offer.setMessage(`Here are the ${keyQuantity} keys you purchased.`);
                    offer.send((err, status) => {
                        if (err) {
                            reject(err);
                        } else {
                            community.acceptConfirmationForObject(secrets.identity_secret, offer.id, (err, status) => {
                                if (err) {
                                    reject(err);
                                } else {
                                    resolve(`Offer for ${keyQuantity} sent to ${partner_steam_id}. Status: ${status}.`);
                                }
                            });
                        }
                    });
                } else {
                    reject('Not enough keys in the inventory.');
                }
            }
        });
    });
}

app.post('/sendtf2keys', async (req, res) => {
    const partner_steam_id = req.body.partner_steam_id;
    const keyQuantity = req.body.keyQuantity;

    if (!partner_steam_id || !keyQuantity) {
        return res.status(400).send('Missing parameters: partner_steam_id or keyQuantity');
    }

    sendTF2Keys(partner_steam_id, keyQuantity)
        .then((result) => res.send(result))
        .catch((err) => res.status(500).send(err));
});

app.listen(3000, () => {
    console.log('Server is up on port 3000');
});