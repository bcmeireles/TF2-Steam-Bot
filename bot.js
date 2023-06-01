const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp');
const SteamCommunity = require('steamcommunity');
const TradeOfferManager = require('steam-tradeoffer-manager');

const secrets = require('./2fasecrets.json');

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