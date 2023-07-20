MASTER_ACCOUNT="map010.testnet" # make sure the account is already created on NEAR blockchain

# mcs factory contract
MCS_FACTORY_NAME=mfac # the name of mcs factory contract to be created, the account ID will be $MCS_FACTORY_NAME.$MASTER_ACCOUNT

# multisig contract
MULTISIG_ACCOUNT="multisig.mfac.map009.testnet" # the account of multisig contract
MEMBERS=(m0.map006.testnet m1.map006.testnet m2.map006.testnet)  # the multisig members list, make sure these accounts have been created on NEAR blockchain

# mcs contract
MCS_NAME="mos"  # the name of mcs contract to be created, the account ID will be $MCS_NAME.$MCS_FACTORY_NAME.$MASTER_ACCOUNT
MAP_MCS_ADDRESS="B6c1b689291532D11172Fb4C204bf13169EC0dCA"  # the mcs contract address on MAP relay chain
WNEAR_ACCOUNT="wrap.testnet"  # wrapped near contract account on NEAR blockchain
NEAR_CHAIN_ID=1360100178526210    # NEAR blockchain ID
MAP_CHAIN_ID=212  # MAP blockchain ID
CLIENT_ACCOUNT="client.cfac2.maplabs.testnet" # the account ID of the map light client contract which has already been deployed
REF_EXCHANGER="ref-finance-101.testnet"
BUTTER_CORE='["core0.corefac.map010.testnet","core1.corefac.map010.testnet"]'

export MCS_FACTORY_ACCOUNT=$MCS_FACTORY_NAME.$MASTER_ACCOUNT
export MCS_ACCOUNT=$MCS_NAME.$MCS_FACTORY_ACCOUNT
export MASTER_ACCOUNT
export CLIENT_ACCOUNT