const secrets = require('./2fasecrets.json');

const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp');
const SteamCommunity = require('steamcommunity');
const TradeOfferManager = require('steam-tradeoffer-manager');

var coinbase = require('coinbase-commerce-node');
var Client = coinbase.Client;
var Charge = coinbase.resources.Charge;
var Webhook = coinbase.Webhook;
Client.init(secrets.coinbase_api_key);

const express = require('express');

const app = express();
app.use(express.json({
    verify: (req, res, buf) => {
        const url = req.originalUrl;
        if (url.startsWith('/webhook')) {
            req.rawBody = buf.toString();
        }
    }
}));

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
  logonID: 1
};

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

function createCharge(steamid, keyQuantity) {
    return new Promise((resolve, reject) => {
        var chargeData = {
            'name': 'TF2 Key Bot',
            'description': `${keyQuantity} tf2 keys to ${steamid}`,
            'local_price': {
                'amount': (parseInt(keyQuantity) * secrets.tf2_key_sell_rate).toString(),
                'currency': 'USD'
            },
            'pricing_type': 'fixed_price',
            'metadata': {
                'steam_id': steamid,
                'keyQuantity': keyQuantity
            }
        }

        Charge.create(chargeData, (error, response) => {
            if (error) {
                reject(error);
            } else {
                resolve(response);
            }
            
        });
    });
}

app.post('/createcharge', async (req, res) => {
    const steamid = req.body.steamid;
    const keyQuantity = req.body.keyQuantity;

    if (!steamid || !keyQuantity) {
        return res.status(400).send('Missing parameters: steamid or keyQuantity');
    }

    createCharge(steamid, keyQuantity)
        .then((result) => res.send(result))
        .catch((err) => res.status(500).send(err));
});

app.post('/webhooks', async (req, res) => {
    try {
        const event = Webhook.verifyEventBody(
            req.rawBody,
            req.headers['x-cc-webhook-signature'],
            secrets.coinbase_webhook_secret
        );

        if (event.type === 'charge:confirmed') {
            console.log('sending 200 status');
            res.sendStatus(200);
            console.log('confirmed')
            let amount = event.data.pricing.local.amount;
            let currency = event.data.pricing.local.currency;
            let steam_id = event.data.metadata.steam_id;
            let keyQuantity = event.data.metadata.keyQuantity;

            console.log(`Charge for ${amount} ${currency} confirmed. Sending ${keyQuantity} keys to ${steam_id}.`);

            sendTF2Keys(steam_id, keyQuantity)
                .then((result) => {
                    console.log('sucessooo');
                    console.log(result);
                    
                })
                .catch((err) => res.status(500).send(err));

        } else {
            console.log(event);
            res.sendStatus(200);
        }

        
    } catch(error) {
        console.error(`Error processing webhook: ${error.message}`);
        res.status(500).json({
            error: error
        });
    }
});




















app.listen(3000, () => {
    console.log('Server is up on port 3000');
});