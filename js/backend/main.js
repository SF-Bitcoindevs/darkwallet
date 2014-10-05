/*
 * @fileOverview Background service running for the wallet
 */
'use strict';

require([
    'backend/port',
    'backend/services/crypto',
    'backend/services/lobby',
    'backend/services/obelisk',
    'backend/services/wallet',
    'backend/services/stealth',
    'backend/services/gui',
    'backend/services/ticker',
    'backend/services/mixer',
    'backend/services/multisig_track',
    'backend/services/safe',
    'backend/services/badge',
    'backend/services/notifier',
    'backend/services/content',
    'backend/services/ctxmenus'],
    function(Port) {

var serviceClasses = [].splice.call(arguments, 1);

function DarkWalletService(serviceClasses) {
    var self = this;

    // Backend services
    var services = this.initializeServices(serviceClasses);
    var servicesStatus = this.servicesStatus;


    /***************************************
    /* Hook up some utility functions
     */

    this.loadIdentity = function(idx, callback) {
        return services.wallet.loadIdentity(idx, callback);
    };

    // Get an identity from the keyring
    this.getIdentity = function(idx) {
        return services.wallet.getIdentity(idx);
    };
    this.getCurrentIdentity = function() {
        return services.wallet.getCurrentIdentity();
    };
    this.getLobbyTransport = function() {
        return services.lobby.getLobbyTransport();
    };

    // Start up history for an address
    this.initAddress = function(walletAddress) { return services.wallet.initAddress(walletAddress); }

    /***************************************
    /* Global communications
     */

    Port.connect('wallet', function(data) {
        // wallet closing
        if (data.type == 'closing') {
            services['obelisk'].disconnect();
        }
    });

    this.connect = function(connectUri) {
        var identity = services.wallet.getCurrentIdentity();
        connectUri = connectUri || identity.connections.getSelectedServer().address;
        if (!connectUri) {
           console.log("no uri disconnecting!");
           return;
        }

        console.log("[main] connecting", connectUri);
        servicesStatus.gateway = 'connecting';
        services.obelisk.connect(connectUri, function(err) {
            if (err) {
                servicesStatus.gateway = 'error';
            } else {
                servicesStatus.gateway = 'ok';
                services.wallet.handleInitialConnect();
            }
        });
    };
    this.getKeyRing = function() {
        return services.wallet.getKeyRing();
    };

    this.getClient = function() {
        return services.obelisk.getClient();
    };
    
    this.getServices = function() {
        return self.service;
    };
}

/**
 * Instantiates an object and prepares a getter function for each service.
 * Getter functions are available under `service` property, for example you can
 * get obelisk from `obj.service.obelisk`.
 * @param {Object[]} serviceClasses Array with the services modules to be instantialzed
 * @return {Object[]} Object that contains the real services
 * @private
 */
DarkWalletService.prototype.initializeServices = function(serviceClasses) {
    this.service = {};
    var services = {};
    
    for(var i in serviceClasses) {
        var service = new serviceClasses[i](this);
        if (!service.name) {
          throw Error('Service ' + serviceClasses[i].name + ' has no name property');
        }
        if (Object.keys(services).indexOf(service.name) !== -1) {
          throw Error('Name of service ' + service.name + ' repeated');
        }
        services[service.name] = service;
    }
    
    // Public API
    for(var i in services) {
        Object.defineProperty(this.service, i, {
            get: function() {
                var j = services[i];
                return function() {
                    return j;
                };
            }()
        });
    };
    
    this.servicesStatus = { gateway: 'offline', obelisk: 'offline' };
    return services;
};

/***************************************
/* Communications
 */
var sendInternalMessage = function(msg) {
    chrome.runtime.sendMessage(chrome.runtime.id, msg);
};

var addListener = function(callback) {
    chrome.runtime.onMessage.addListener(callback);
};


/***************************************
/* Service instance that will be running in the background page
 */
var service = new DarkWalletService(serviceClasses);


/***************************************
/* External OpenBazaar API
 */
chrome.runtime.onMessageExternal.addListener(
    function(request, sender, sendResponse) {
        var obPocket = "OBPocket";
        function getOBPocket() {    
            var pock = null;
            for(var i=0; i< service.getCurrentIdentity().wallet.pockets.pockets.hd.length; i++) {
                if(service.getCurrentIdentity().wallet.pockets.pockets.hd[i].name===obPocket) {
                    pock = service.getCurrentIdentity().wallet.pockets.pockets.hd[i];
                    break;
                }
            }
            return pock
        }
        function getOBIndex() {
            pock = getOBPocket();
            if(!pock) return null;
            return pock.getIndex(pock.getMainAddress());
        }
        var hexChar = ["0", "1", "2", "3", "4", "5", "6", "7","8", "9", "A", "B", "C", "D", "E", "F"] 
        function byteToHex(b) {
            return hexChar[(b >> 4) & 0x0f] + hexChar[b & 0x0f];
        }
        switch(request.method) {
        case "createOBPocket":
            p = getOBPocket();
            if(p) {
                sendResponse({status:"success", data:{created:false}});
            } else {
                service.getCurrentIdentity().wallet.pockets.createPocket(obPocket);
                i = getOBIndex();
                service.getCurrentIdentity().wallet.getAddress([i*2,0]);
                sendResponse({status:"success", data:{created:true}});
            }
            break;
        case "newPubKey":
            p = getOBPocket();
            i = getOBIndex();
            if(!p) {
                sendResponse({status:"fail",data:null});
            } else {
                a = service.getCurrentIdentity().wallet.getAddress([i*2,p.addresses.length]);
                pub = "";
                a.map(function(e) {pub += byteToHex(e); });
                sendResponse({status:"success",data:{address:a.address,publicKey:pub}});
            }
            break;
        case "createMultisig":
            
            break;
        case "mktx":
            p = getOBPocket()
            i = getOBIndex()
            if(!request.value || !p) {
                sendResponse({status:"fail",data:null});
            } else {
                try {
                    o = service.getCurrentIdentity().wallet.getUtxoToPay(request.value,i,"hd");
                    //TODO mktx with unspent outputs
                } catch(err) {
                    sendResponse({status:"fail",data:null});
                }
            }
            break;
        case "mkMultisigTx":
            
            break;
        default:
            sendResponse({status:"fail",data:null});
            break;
        }
    });

/***************************************
/* Bindings for the page window so we can have easy access
 */

window.connect = function(_server) { return service.connect(_server); };

window.loadIdentity = service.loadIdentity;
window.getIdentity = function(idx) { return service.getIdentity(idx); };
window.getCurrentIdentity = service.getCurrentIdentity;

window.getKeyRing = service.getKeyRing;
window.servicesStatus = service.servicesStatus;
window.getLobbyTransport = service.getLobbyTransport;

window.getClient = service.getClient;
window.getServices = service.getServices;

window.initAddress = function(_w) {return service.initAddress(_w);};

window.addListener = addListener;
window.sendInternalMessage = sendInternalMessage;
});
