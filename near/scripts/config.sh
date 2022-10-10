MASTER_ACCOUNT="xyli.testnet"
MCS_ACCOUNT=mcs.$MASTER_ACCOUNT
CLIENT_ACCOUNT="client.map001.testnet"
MAP_BRIDGE_ADDRESS="1902347e9CCC4e4aa0cf0b19844bf528f0031642"
WNEAR_ACCOUNT="wrap.testnet"
NEAR_CHAIN_ID=1313161555
INIT_ARGS_MCS='{
              "map_light_client": "'$CLIENT_ACCOUNT'",
              "map_bridge_address": "'$MAP_BRIDGE_ADDRESS'",
              "wrapped_token": "'$WNEAR_ACCOUNT'",
              "near_chain_id": '$NEAR_CHAIN_ID'
            }'

