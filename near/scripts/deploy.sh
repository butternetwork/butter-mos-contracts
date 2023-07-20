set -e

SCRIPT_DIR=$(dirname $0)
RES_DIR=$SCRIPT_DIR/res

source $SCRIPT_DIR/config.sh

function printHelp() {
  echo "Usage:"
  echo "  $FILE_NAME <command>"
  echo "Commands:"
  echo "  deploy_factory                                   deploy mos factory contract"
  echo "  deploy_mos                                       deploy mos contract"
  echo "  help                                             show help"
}

function deploy_factory() {
  echo "creating mos factory account"
  near create-account $MCS_FACTORY_ACCOUNT --masterAccount $MASTER_ACCOUNT --initialBalance 30

  echo "deploying mos factory contract"
  near deploy --accountId $MCS_FACTORY_ACCOUNT --wasmFile $RES_DIR/mos_factory.wasm
}

function deploy_mos() {
  echo "creating and initializing mos contract"

  INIT_ARGS_MCS='{
                "name":"'$MCS_NAME'",
                "owner": "'$MULTISIG_ACCOUNT'",
                "map_light_client": "'$CLIENT_ACCOUNT'",
                "map_bridge_address": "'$MAP_MCS_ADDRESS'",
                "wrapped_token": "'$WNEAR_ACCOUNT'",
                "near_chain_id": "'$NEAR_CHAIN_ID'",
                "map_chain_id": "'$MAP_CHAIN_ID'",
                "ref_exchange":"'$REF_EXCHANGER'",
                "butter_core":'$BUTTER_CORE'
              }'

  echo $INIT_ARGS_MCS
  near call $MCS_FACTORY_ACCOUNT create_mos "$INIT_ARGS_MCS" --accountId $MASTER_ACCOUNT --gas 300000000000000 --deposit 30
}

if [[ $# -gt 0 ]]; then
  case $1 in
    deploy_factory)
      if [[ $# == 1 ]]; then
        deploy_factory
      else
        printHelp
        exit 1
      fi
      ;;
    deploy_mos)
      if [[ $# == 1 ]]; then
        shift
        deploy_mos
      else
        printHelp
        exit 1
      fi
      ;;
    help)
      printHelp
      ;;
    *)
      echo "Unknown command $1"
      printHelp
      exit 1
      ;;
  esac
  else
    printHelp
    exit 1
fi
