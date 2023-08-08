const secrets = require('./2fasecrets.json');

const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp');
const SteamCommunity = require('steamcommunity');
var SteamID = SteamCommunity.SteamID;
const TradeOfferManager = require('steam-tradeoffer-manager');
Error.stackTraceLimit = Infinity;
const axios = require('axios');
const crypto = require('crypto');

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

let inTrade = [];
MAX_KEY_COUNT = 200;

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
                console.log("1")
                reject(err);
            } else {
                const offer = manager.createOffer(partner_steam_id);
                const keys = inventory.filter(item => item.market_hash_name === 'Mann Co. Supply Crate Key'  && !inTrade.includes(item.assetid));

                console.log("2")

                if (keys.length >= keyQuantity) {
                    for (let i = 0; i < keyQuantity; i++) {
                        offer.addMyItem(keys[i]);
                        inTrade.push(keys[i].assetid);
                    }
                    offer.setMessage(`Here are the ${keyQuantity} keys you purchased.`);
                    offer.send((err, status) => {
                        if (err) {
                            console.log("3")
                            reject(err);
                        } else {
                            console.log("4")
                            community.acceptConfirmationForObject(secrets.identity_secret, offer.id, (err, status) => {
                            console.log("6")
                            resolve(`Offer for ${keyQuantity} sent to ${partner_steam_id}. Status: ${status}.`);
                            });
                        }
                    });
                } else {
                    console.log("7")
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
        .then((result) => res.status(200).send(result))
        .catch((err) => res.status(500).send(err));
});

function createCharge(steamid, keyQuantity, origin) {
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
                'keyQuantity': keyQuantity,
                'origin': origin
            }
        }

        console.log("aqui lolol")

        Charge.create(chargeData, (error, response) => {
            if (error) {
                console.log("erro aqui 1")
                reject(error);
            } else {
                console.log("erro aqui 2")
                resolve(response);
            }
            
        });
    });
}

app.post('/createcharge', async (req, res) => {
    const steamid = req.body.steamid;
    const keyQuantity = req.body.keyQuantity;
    const origin = req.body.origin;

    if (!steamid || !keyQuantity || !origin) {
        return res.status(400).send('Missing parameters: steamid or keyQuantity or origin');
    }

    createCharge(steamid, keyQuantity, origin)
        .then((result) => {
            console.log("chegou aqui 123");
            res.send(result)
        })
        .catch((err) => {
            console.log("foi para aqui 456");
            console.log(err);
            res.status(500).send(err)
        });
});

function payForKeys(steamid, usd_amount, coin, address) {
    return new Promise((resolve, reject) => {
        usd_amount = parseFloat(usd_amount).toFixed(2);
        console.log(`Sending ${usd_amount} ${coin} to ${address} for ${steamid}`)
        var timestamp = Math.floor(Date.now() / 1000);
        var message = timestamp + "GET" + "/v2/exchange-rates?currency=" + coin.toUpperCase();

        return axios.get("https://api.coinbase.com/v2/exchange-rates?currency=" + coin.toUpperCase(), {
            headers: {
                'CB-ACCESS-KEY': secrets.coinbase_wallet_api_key,
                'CB-ACCESS-SIGN': crypto.createHmac('sha256', secrets.coinbase_wallet_api_secret).update(message).digest('hex'),
                'CB-ACCESS-TIMESTAMP': timestamp,
                'CB-VERSION': '2023-06-15'
            }
        }).then((response) => {
            let amount = (parseFloat(usd_amount) / parseFloat(response.data.data.rates.USD)).toFixed(8).toString();
            console.log(`Amount of ${coin} to send: ${amount}`);
            let timestamp = Math.floor(Date.now() / 1000);
            //let message = timestamp + `POST/v2/accounts/${secrets.coinbase_user_id}/transactions`;
            let unique = steamid + usd_amount + coin + address;

            if (unique.length > 99) {
                unique = unique.substring(0, 99);
            }

            let message = timestamp + "POST" + `/v2/accounts/${coin}/transactions` + JSON.stringify({
                "type": "send",
                "to": address,
                "amount": amount,
                "currency": coin,
                "idem": unique
            });

            console.log("Sending transaction to Coinbase..." + amount.toString())

            axios.post(`https://api.coinbase.com/v2/accounts/${coin}/transactions`, {
                "type": "send",
                "to": address,
                "amount": amount,
                "currency": coin,
                "idem": unique
            }, {
                headers: {
                    'CB-ACCESS-KEY': secrets.coinbase_wallet_api_key,
                    'CB-ACCESS-SIGN': crypto.createHmac('sha256', secrets.coinbase_wallet_api_secret).update(message).digest('hex'),
                    'CB-ACCESS-TIMESTAMP': timestamp,
                    'CB-VERSION': '2023-06-15'
                }
            }).then((response) => {
                try {
                    client.chatMessage(steamid, response.data.data.details.header);
                } catch (err) {
                    console.log(err);
                }
                resolve(response.data);
            }).catch((err) => {
                reject(err);
            })
        });
    });
}

app.post('/payforkeys', async (req, res) => {
    const steamid = req.body.steamid;
    const usd_amount = req.body.usd_amount;
    const coin = req.body.coin;
    const address = req.body.address;

    if (!steamid || !usd_amount || !coin || !address) {
        return res.status(400).send('Missing parameters: steamid, usd_amount, coin, or address');
    }

    payForKeys(steamid, usd_amount, coin, address)
        .then((result) => res.send(result))
        .catch((err) => res.status(500).send(err));
});

app.get('/stock', async (req, res) => {
    manager.getInventoryContents(440, 2, true, (err, inventory) => {
        if (err) {
            res.status(500).send(err);
        } else {
            const keys = inventory.filter(item => item.market_hash_name === 'Mann Co. Supply Crate Key' && !inTrade.includes(item.assetid));
            res.send({
                'tf2keys': keys.length
            })
        }
    });
});

app.post('/webhooks', async (req, res) => {
        const event = Webhook.verifyEventBody(
            req.rawBody,
            req.headers['x-cc-webhook-signature'],
            secrets.coinbase_webhook_secret
        );

        if (event.type === 'charge:confirmed') {
            console.log('sending 200 status');
            
            console.log('confirmed')
            let amount = event.data.pricing.local.amount;
            let currency = event.data.pricing.local.currency;
            let steam_id = event.data.metadata.steam_id;
            let keyQuantity = event.data.metadata.keyQuantity;
            let origin = event.data.metadata.origin;

            console.log(`Charge for ${amount} ${currency} confirmed. Sending ${keyQuantity} keys to ${steam_id}.`);

            sendTF2Keys(steam_id, keyQuantity)
                .then((result) => {
                    console.log('sucessooo');
                    //if (origin === 'steam') { client.chatMessage(SteamID(steam_id), `Charge for ${amount} ${currency} confirmed. Sending ${keyQuantity} keys to ${steam_id}.`) }
                    //console.log(result);
                    //console.log('sucessooo2');
                    axios.get(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${secrets.steam_api_key}&steamids=${steam_id.toString()}`)
                    .then((response) => {
                        let avatar = response.data.response.players[0].avatarfull;
                        console.log('sucessooo3');
                        axios.post(secrets.discord_webhook, {
                            "content": null,
                            "embeds": [
                              {
                                "title": `Keys delivered to ${steam_id.toString()}`,
                                "color": 65280,
                                "fields": [
                                  {
                                    "name": "Amount",
                                    "value": keyQuantity,
                                    "inline": true
                                  },
                                  {
                                    "name": "Price",
                                    "value": (parseInt(amount.split(" ")[1]) * secrets.tf2_key_sell_rate).toString(),
                                    "inline": true
                                  }
                                ],
                                "author": {
                                  "name": steam_id.toString(),
                                  "url": `https://steamcommunity.com/profiles/${steam_id.toString()}`,
                                  "icon_url": avatar
                                }
                              }
                            ],
                            "attachments": []
                          })

                          console.log("yay");

                          res.sendStatus(200);
                          return
                    })
                    .catch((err) => {
                        console.log("buy1");
                        console.log(err);
                        res.status(500).send(err);
                        return
                    });
                    
                })
                .catch((err) => {
                    console.log("buy2");
                    console.log(err.data);
                    console.log(err)
                    res.status(500).send(err);
                    return
                });

        } else {
            console.log("buy3");
            console.log(event);
            res.sendStatus(500);
            return
        }

        
    
});

manager.on('newOffer', function(offer) {
    console.log("New offer #" + offer.id + " from " + offer.partner.getSteamID64());
    if (offer.itemsToGive.length === 0) {
        let accepted = false;
        let message = offer.message;
        let receiving = offer.itemsToReceive.filter(item => item.market_hash_name === 'Mann Co. Supply Crate Key').length;

        if (receiving > 0) {
            console.log(`Receiving ${receiving} keys from ${offer.partner.getSteamID64()}`);
        }

        manager.getInventoryContents(440, 2, true, (err, inventory) => {
            if (err) {
                console.log(err)
            } else {
                let keyCount = inventory.filter(item => item.market_hash_name === 'Mann Co. Supply Crate Key').length;
                if (keyCount + receiving <= MAX_KEY_COUNT) {
                    offer.accept((err, status) => {
                        if (err) {
                            console.log("erro 1");
                            console.log(err);
                        } else {
                            if (message.length > 2) {
                                console.log(`I'm here. Status: ${status}.`);
                                accepted = true;
                                console.log("and accepted is set to true");
                                console.log(accepted);
                                console.log("successfulyl accepted offer, going to send the monies");
                                payForKeys(offer.partner.getSteamID64(), receiving * secrets.tf2_key_buy_rate, message.split(" ")[0], message.split(" ")[1])
                                    .then((result) => console.log(result))
                                    .catch((err) => console.log(err.data));
                            } else {
                                console.log('Donation accepted')
                            }
                            
                            }
                    })

                } else {
                    offer.decline(err => {
                        if (err) {
                            console.log("erro 2");
                            console.log(err);
                        } else {
                            console.log('Offer declined.');
                        }
                    });
                }
            }
        })

        

    } else if (offer.partner.getSteamID64() === secrets.owner_account_id) {
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


















app.listen(3000, () => {
    console.log('Server is up on port 3000');
});
