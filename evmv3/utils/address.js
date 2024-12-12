
function solanaAddressToHex(solanaAddress) {
    return '0x' + bytesToHexString(ethers.utils.base58.decode(solanaAddress))
}

function hexToSolanaAddress(hexAddress) {
    return ethers.utils.base58.encode(hexAddress)
}

function bytesToHexString(bytes) {
    return Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

module.exports = {
    solanaAddressToHex,
    hexToSolanaAddress
};