const { bech32, bech32m } = require('bech32')
const TronWeb = require("tronweb");

function solanaAddressToHex(solanaAddress) {
    return '0x' + bytesToHexString(ethers.utils.base58.decode(solanaAddress))
}

function hexToSolanaAddress(hexAddress) {
    return ethers.utils.base58.encode(hexAddress)
}

function bytesToHexString(bytes) {
    return Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function tronAddressToHex(tronAddress) {
    return '0x' + TronWeb.address.toHex(tronAddress).substring(2)
}

function hexToTronAddress(hexAddress) {
    return TronWeb.address.fromHex(hexAddress)
}

function btcAddressToHex(btcAddress) {
    let hex;
    const prefix = btcAddress.substr(0, 2).toLowerCase();
    if (prefix === 'bc' || prefix === 'tb') {
        if(btcAddress.startsWith('bc1p') || btcAddress.startsWith('tb1p') || btcAddress.startsWith('bcrt1p')){
            hex = '0x' + bytesToHexString(bech32m.decode(btcAddress).words)
        } else {
            console.log(bech32.decode(btcAddress).prefix)
            hex = '0x' + bytesToHexString(bech32.decode(btcAddress).words)
        }
    } else {
        hex = '0x' + bytesToHexString(ethers.utils.base58.decode(btcAddress));
        // no chechsum
        hex = hex.substring(0, (hex.length - 8))
    }
    return hex;
}

function hexToBtcAddress(hexAddress, encodeType) {
    if(encodeType === "base58"){
        // add checksum
        let checksum = ethers.utils.sha256(ethers.utils.sha256(hexAddress)).substring(2,10);
        return ethers.utils.base58.encode((hexAddress + checksum))
    } else if(encodeType === "bech32m"){
        return bech32m.encode("bc", ethers.utils.arrayify(hexAddress))
    } else {
        return bech32.encode("bc", ethers.utils.arrayify(hexAddress))
    }
}

module.exports = {
    solanaAddressToHex,
    hexToSolanaAddress,
    btcAddressToHex,
    hexToBtcAddress,
    tronAddressToHex,
    hexToTronAddress
};