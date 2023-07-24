MASTER_ACCOUNT="map009.testnet" # make sure the account is already created on NEAR blockchain

# mcs contract
MCS_NAME="mos"  # the name of mcs contract to be created, the account ID will be $MCS_NAME.$MCS_FACTORY_NAME.$MASTER_ACCOUNT
MAP_MCS_ADDRESS="3D8da6f43e35E05162d874BdaF93f61995A34D81"  # the mcs contract address on MAP relay chain
WNEAR_ACCOUNT="wrap.testnet"  # wrapped near contract account on NEAR blockchain
NEAR_CHAIN_ID=1360100178526210    # NEAR blockchain ID
MAP_CHAIN_ID=212  # MAP blockchain ID
CLIENT_ACCOUNT="client3.cfac2.maplabs.testnet" # the account ID of the map light client contract which has already been deployed
REF_EXCHANGE="ref-finance-101.testnet"
BUTTER_CORE='["core5.corefac.map008.testnet"]'

USDC=usdc.map007.testnet
USDT=usdt.map007.testnet
USER=pandarr.testnet
USER_EVM="0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"

export MCS_ACCOUNT=$MCS_NAME.$MASTER_ACCOUNT
export MASTER_ACCOUNT
export CLIENT_ACCOUNT