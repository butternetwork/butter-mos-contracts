set -e

SCRIPT_DIR=$(dirname $0)
RES_DIR=$SCRIPT_DIR/../res

source $SCRIPT_DIR/config.sh

INIT_ARGS_MCS='{
              "owner": "'$MCS_ACCOUNT'",
              "map_light_client": "'$CLIENT_ACCOUNT'",
              "map_bridge_address": "'$MAP_MCS_ADDRESS'",
              "wrapped_token": "'$WNEAR_ACCOUNT'",
              "near_chain_id": "'$NEAR_CHAIN_ID'",
              "map_chain_id": "'$MAP_CHAIN_ID'",
              "ref_exchange": "'$REF_EXCHANGE'",
              "butter_core": '$BUTTER_CORE'
            }'

echo $INIT_ARGS_MCS

echo "creating mos factory account"
near create-account $MCS_ACCOUNT --masterAccount $MASTER_ACCOUNT --initialBalance 30

echo "deploying mos contract"
near deploy --accountId $MCS_ACCOUNT --wasmFile $RES_DIR/mos.wasm

echo "initialize mos contract"
near call $MCS_ACCOUNT init "$INIT_ARGS_MCS" --accountId $MASTER_ACCOUNT --gas 300000000000000

near call $MCS_ACCOUNT set_chain_type '{"chain_id": "212", "chain_type": "EvmChain"}' --accountId $MCS_ACCOUNT
near call $MCS_ACCOUNT set_chain_type '{"chain_id": "97", "chain_type": "EvmChain"}' --accountId $MCS_ACCOUNT
near call $MCS_ACCOUNT set_chain_type '{"chain_id": "80001", "chain_type": "EvmChain"}' --accountId $MCS_ACCOUNT
near call $MCS_ACCOUNT set_chain_type '{"chain_id": "5", "chain_type": "EvmChain"}' --accountId $MCS_ACCOUNT

near call $MCS_ACCOUNT register_token '{"token":"'$USDC'", "mintable":false}' --accountId $MCS_ACCOUNT --deposit 1 --gas 300000000000000
near call $MCS_ACCOUNT register_token '{"token":"'$USDT'", "mintable":false}' --accountId $MCS_ACCOUNT --deposit 1 --gas 300000000000000
near call $MCS_ACCOUNT register_token '{"token":"'$WNEAR_ACCOUNT'", "mintable":false}' --accountId $MCS_ACCOUNT --deposit 1 --gas 300000000000000

near call $MCS_ACCOUNT add_fungible_token_to_chain '{"token": "'$USDC'", "to_chain": "212"}' --accountId $MCS_ACCOUNT --gas 300000000000000
near call $MCS_ACCOUNT add_fungible_token_to_chain '{"token": "'$USDT'", "to_chain": "212"}' --accountId $MCS_ACCOUNT --gas 300000000000000
near call $MCS_ACCOUNT add_fungible_token_to_chain '{"token": "'$WNEAR_ACCOUNT'", "to_chain": "212"}' --accountId $MCS_ACCOUNT --gas 300000000000000

near call $MCS_ACCOUNT add_fungible_token_to_chain '{"token": "'$USDC'", "to_chain": "97"}' --accountId $MCS_ACCOUNT --gas 300000000000000
near call $MCS_ACCOUNT add_fungible_token_to_chain '{"token": "'$USDT'", "to_chain": "97"}' --accountId $MCS_ACCOUNT --gas 300000000000000
near call $MCS_ACCOUNT add_fungible_token_to_chain '{"token": "'$WNEAR_ACCOUNT'", "to_chain": "97"}' --accountId $MCS_ACCOUNT --gas 300000000000000

near call $MCS_ACCOUNT add_fungible_token_to_chain '{"token": "'$USDC'", "to_chain": "80001"}' --accountId $MCS_ACCOUNT --gas 300000000000000
near call $MCS_ACCOUNT add_fungible_token_to_chain '{"token": "'$USDT'", "to_chain": "80001"}' --accountId $MCS_ACCOUNT --gas 300000000000000
near call $MCS_ACCOUNT add_fungible_token_to_chain '{"token": "'$WNEAR_ACCOUNT'", "to_chain": "80001"}' --accountId $MCS_ACCOUNT --gas 300000000000000

near call $MCS_ACCOUNT add_fungible_token_to_chain '{"token": "'$USDC'", "to_chain": "5"}' --accountId $MCS_ACCOUNT --gas 300000000000000
near call $MCS_ACCOUNT add_fungible_token_to_chain '{"token": "'$USDT'", "to_chain": "5"}' --accountId $MCS_ACCOUNT --gas 300000000000000
near call $MCS_ACCOUNT add_fungible_token_to_chain '{"token": "'$WNEAR_ACCOUNT'", "to_chain": "5"}' --accountId $MCS_ACCOUNT --gas 300000000000000

near call $USDC ft_transfer_call '{"receiver_id":"'$MCS_ACCOUNT'", "amount":"177989050007", "memo": "", "msg": "{\"type\": \"Deposit\", \"to\": \"'$USER_EVM'\"}"}' --accountId $USER --depositYocto 1 --gas 60000000000000
near call $USDT ft_transfer_call '{"receiver_id":"'$MCS_ACCOUNT'", "amount":"500000000", "memo": "", "msg": "{\"type\": \"Deposit\", \"to\": \"'$USER_EVM'\"}"}' --accountId $USER --depositYocto 1 --gas 60000000000000

near call $MCS_ACCOUNT add_swap_entrance '{"entrance_hash": "4ab0cc562d984eea00b4edada698f5739b9c180e0fc6d971751f900a6921ff19", "fee_rate": "0", "fee_receiver": "mos.map009.testnet"}' --accountId $MCS_ACCOUNT --gas 300000000000000
near call $MCS_ACCOUNT add_swap_entrance '{"entrance_hash": "d30f28e06f2e66cfe7ed43d967a5c499a8d331d157d800bf773b9640b560b142", "fee_rate": "7000", "fee_receiver": "map010.testnet"}' --accountId $MCS_ACCOUNT --gas 300000000000000
