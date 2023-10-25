MASTER_ACCOUNT="butternetwork.near" # make sure the account is already created on NEAR blockchain

# mcs factory contract
MCS_FACTORY_NAME=mfac # the name of mcs factory contract to be created, the account ID will be $MCS_FACTORY_NAME.$MASTER_ACCOUNT

# multisig contract
MULTISIG_ACCOUNT="multisig.mfac.butternetwork.near" # the account of multisig contract
MEMBERS=(m0.butternetwork.near m1.butternetwork.near m2.butternetwork.near)  # the multisig members list, make sure these accounts have been created on NEAR blockchain

# mcs contract
MCS_NAME="mosv21"  # the name of mcs contract to be created, the account ID will be $MCS_NAME.$MCS_FACTORY_NAME.$MASTER_ACCOUNT
MAP_MCS_ADDRESS="feB2b97e4Efce787c08086dC16Ab69E063911380"  # the mcs contract address on MAP relay chain
WNEAR_ACCOUNT="wrap.near"  # wrapped near contract account on NEAR blockchain
NEAR_CHAIN_ID=1360100178526209    # NEAR blockchain ID
MAP_CHAIN_ID=22776  # MAP blockchain ID
CLIENT_ACCOUNT="client2.cfac.mapprotocol.near" # the account ID of the map light client contract which has already been deployed
REF_EXCHANGER="v2.ref-finance.near"
BUTTER_CORE='["core20.corefac.butternetwork.nearr","core21.corefac.butternetwork.near"]'

export MCS_FACTORY_ACCOUNT=$MCS_FACTORY_NAME.$MASTER_ACCOUNT
export MCS_ACCOUNT=$MCS_NAME.$MCS_FACTORY_ACCOUNT
export MEMBERS
export MASTER_ACCOUNT
export CLIENT_ACCOUNT