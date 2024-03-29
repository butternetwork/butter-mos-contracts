set -e

SCRIPT_DIR=$(dirname $0)
RES_DIR=$SCRIPT_DIR/res

source $SCRIPT_DIR/config.sh

function printHelp() {
  echo "Usage:"
  echo "  $FILE_NAME <command>"
  echo "Commands:"
  echo "  request_and_confirm <request type> <member> add request and confirm by member"
  echo "  request_type:"
  echo "    add_native <chain id>                    add native token to_chain"
  echo "    add_mcs    <token> <chain id>            add mcs token to_chain"
  echo "    add_ft    <token> <chain id>             add fungible token to_chain"
  echo "    add_core   <core>                        add butter core"
  echo "    reset_core   <core>                      reset butter core to idle core"
  echo "    clean_core                               clean all idle core"
  echo "    set_entrance <hash> <rate> <receiver>    set butter entrance info"
  echo "    near_chain_id    <near chain id>         set near chain id"
  echo "    map_chain_id    <map chain id>           set map chain id"
  echo "    map_relay_address   <map relay address>  set map relay address"
  echo "    remove_native <chain id>                 remove native token to_chain"
  echo "    remove_mcs    <token> <chain id>         remove mcs token to_chain"
  echo "    remove_ft    <token> <chain id>          remove fungible token to_chain"
  echo "    upgrade_multisig  <wasm file>            upgrade multisig contract"
  echo "    upgrade_map_client  <wasm file>          upgrade map light client contract"
  echo "    upgrade_mcs  <wasm file>                 upgrade mcs contract"
  echo "    upgrade_mcs_token <token>  <wasm file>   upgrade mcs token contract"
  echo "    upgrade_core <core> <wasm file>          upgrade butter core contract"
  echo "    set_client  <map client account>         set new map light client account to mcs contract"
  echo "    set_owner  <multisig account>            set new multisig light client account to mcs contract"
  echo "    set_paused  <mask>                       set paused flag to mcs contract"
  echo "  confirm <request id> <member>              confirm request"
  echo "  execute <request id> <account>             execute confirmed request"
  echo "  set_req_limit  <limit> <member>           set multisig active request limit"
  echo "  help                                       show help"
}

function prepare_request() {
  case $1 in
    add_native)
      if [[ $# == 3 ]]; then
        echo "adding native token to_chain $2 to mcs contract"
        RECEIVER=$MCS_ACCOUNT
        METHOD="add_native_to_chain"
        ARGS=`echo '{"to_chain": "'$2'"}'| base64`
        MEMBER=$3
      else
        printHelp
        exit 1
      fi
      ;;
    add_mcs)
      if [[ $# == 4 ]]; then
        echo "add mcs token $2 to_chain $3 to mcs contract"
        RECEIVER=$MCS_ACCOUNT
        METHOD="add_mcs_token_to_chain"
        ARGS=`echo '{"token": "'$2'", "to_chain": "'$3'"}'| base64`
        MEMBER=$4
      else
        printHelp
        exit 1
      fi
      ;;
    add_ft)
      if [[ $# == 4 ]]; then
        echo "add ft token $2 to_chain $3 to mcs contract"
        RECEIVER=$MCS_ACCOUNT
        METHOD="add_fungible_token_to_chain"
        ARGS=`echo '{"token": "'$2'", "to_chain": "'$3'"}'| base64`
        MEMBER=$4
      else
        printHelp
        exit 1
      fi
      ;;
    add_core)
      echo $#
      if [[ $# == 3 ]]; then
        echo "add core $2 to mos contract"
        RECEIVER=$MCS_ACCOUNT
        METHOD="add_butter_core"
        ARGS=`echo '{"butter_core": "'$2'"}'| base64`
        MEMBER=$3
      else
        printHelp
        exit 1
      fi
      ;;
    reset_core)
      echo $#
      if [[ $# == 3 ]]; then
        echo "reset working core $2 to idle"
        RECEIVER=$MCS_ACCOUNT
        METHOD="reset_butter_core"
        ARGS=`echo '{"core": "'$2'"}'| base64`
        MEMBER=$3
      else
        printHelp
        exit 1
      fi
      ;;
    clean_core)
      echo $#
      if [[ $# == 2 ]]; then
        echo "clean all idle cores"
        RECEIVER=$MCS_ACCOUNT
        METHOD="clean_idle_core"
        ARGS=`echo '{}'| base64`
        MEMBER=$2
      else
        printHelp
        exit 1
      fi
      ;;
    set_entrance)
      echo $#
      if [[ $# == 5 ]]; then
        echo "set entrance info for $2, fee_rate is $3 and receiver is $4"
        RECEIVER=$MCS_ACCOUNT
        METHOD="add_swap_entrance"
        ARGS=`echo '{"entrance_hash": "'$2'", "fee_rate": "'$3'", "fee_receiver": "'$4'" }'| base64`
        MEMBER=$5
      else
        printHelp
        exit 1
      fi
      ;;
    remove_native)
      if [[ $# == 3 ]]; then
        echo "remove native token to_chain $2 from mcs contract"
        RECEIVER=$MCS_ACCOUNT
        METHOD="remove_native_to_chain"
        ARGS=`echo '{"to_chain": "'$2'"}'| base64`
        MEMBER=$3
      else
        printHelp
        exit 1
      fi
      ;;
    remove_mcs)
      if [[ $# == 4 ]]; then
        echo "remove mcs token $2 to_chain $3 from mcs contract"
        RECEIVER=$MCS_ACCOUNT
        METHOD="remove_mcs_token_to_chain"
        ARGS=`echo '{"token": "'$2'", "to_chain": "'$3'"}'| base64`
        MEMBER=$4
      else
        printHelp
        exit 1
      fi
      ;;
    remove_ft)
      if [[ $# == 4 ]]; then
        echo "remove ft token $2 to_chain $3 from mcs contract"
        RECEIVER=$MCS_ACCOUNT
        METHOD="remove_fungible_token_to_chain"
        ARGS=`echo '{"token": "'$2'", "to_chain": "'$3'"}'| base64`
        MEMBER=$4
      else
        printHelp
        exit 1
      fi
      ;;
    metadata)
      if [[ $# == 4 ]]; then
        echo "set metadata of mcs token $2's decimals to $3"
        RECEIVER=$2
        METHOD="set_metadata"
        ARGS=`echo '{"decimals": '$3'}'| base64`
        MEMBER=$4
      else
        printHelp
        exit 1
      fi
      ;;
    chain_type)
      if [[ $# == 4 ]]; then
        echo "set chain type of chain $2 to $3"
        RECEIVER=$MCS_ACCOUNT
        METHOD="set_chain_type"
        ARGS=`echo '{"chain_id": "'$2'", "chain_type": "'$3'"}'| base64`
        MEMBER=$4
      else
        printHelp
        exit 1
      fi
      ;;
    near_chain_id)
      if [[ $# == 3 ]]; then
        echo "set near chain id to $2"
        RECEIVER=$MCS_ACCOUNT
        METHOD="set_near_chain_id"
        ARGS=`echo '{"near_chain_id": "'$2'"}'| base64`
        MEMBER=$3
      else
        printHelp
        exit 1
      fi
      ;;
    map_chain_id)
      if [[ $# == 3 ]]; then
        echo "set map chain id to $2"
        RECEIVER=$MCS_ACCOUNT
        METHOD="set_map_chain_id"
        ARGS=`echo '{"map_chain_id": "'$2'"}'| base64`
        MEMBER=$3
      else
        printHelp
        exit 1
      fi
      ;;
    map_relay_address)
      if [[ $# == 3 ]]; then
        echo "set map relay address to $2"
        RECEIVER=$MCS_ACCOUNT
        METHOD="set_map_relay_address"
        ARGS=`echo '{"map_relay_address": "'$2'"}'| base64`
        MEMBER=$3
      else
        printHelp
        exit 1
      fi
      ;;
    upgrade_multisig)
      if [[ $# == 3 ]]; then
        echo "upgrade multisig contract to $2"
        RECEIVER=$MULTISIG_ACCOUNT
        METHOD="upgrade_self"
        CODE=`base64 -i $2`
        ARGS=`echo '{"code": "'$CODE'"}'| base64`
        MEMBER=$3
      else
        printHelp
        exit 1
      fi
      ;;
    upgrade_map_client)
      if [[ $# == 3 ]]; then
        echo "upgrade map light client contract to $2"
        RECEIVER=$CLIENT_ACCOUNT
        METHOD="upgrade_client"
        CODE=`base64 -i $2`
        ARGS=`echo '{"code": "'$CODE'"}'| base64`
        MEMBER=$3
      else
        printHelp
        exit 1
      fi
      ;;
    upgrade_mcs)
      if [[ $# == 3 ]]; then
        echo "upgrade mcs contract to $2"
        RECEIVER=$MCS_ACCOUNT
        METHOD="upgrade_self"
        CODE=`base64 -i $2`
        ARGS=`echo '{"code": "'$CODE'"}'| base64`
        MEMBER=$3
      else
        printHelp
        exit 1
      fi
      ;;
    upgrade_mcs_token)
      if [[ $# == 4 ]]; then
        echo "upgrade mcs token $2 to $3"
        RECEIVER=$2
        METHOD="upgrade_self"
        CODE=`base64 -i $3`
        ARGS=`echo '{"code": "'$CODE'"}'| base64`
        MEMBER=$4
      else
        printHelp
        exit 1
      fi
      ;;
    upgrade_core)
      if [[ $# == 4 ]]; then
        echo "upgrade buttor core $2 to $3"
        RECEIVER=$2
        METHOD="upgrade_self"
        CODE=`base64 -i $3`
        ARGS=`echo '{"code": "'$CODE'"}'| base64`
        MEMBER=$4
      else
        printHelp
        exit 1
      fi
      ;;
    set_client)
      if [[ $# == 3 ]]; then
        echo "set map light client account of mcs contract to $2"
        RECEIVER=$MCS_ACCOUNT
        METHOD="set_map_light_client"
        ARGS=`echo '{"map_client_account": "'$2'"}'| base64`
        MEMBER=$3
      else
        printHelp
        exit 1
      fi
      ;;
    set_owner)
      if [[ $# == 3 ]]; then
        echo "set multisig owner of mcs contract to $2"
        RECEIVER=$MCS_ACCOUNT
        METHOD="set_owner"
        ARGS=`echo '{"new_owner": "'$2'"}'| base64`
        MEMBER=$3
      else
        printHelp
        exit 1
      fi
      ;;
    set_paused)
      if [[ $# == 3 ]]; then
        echo "set mcs contract paused flag to $2"
        RECEIVER=$MCS_ACCOUNT
        METHOD="set_paused"
        ARGS=`echo '{"paused": '$2'}'| base64`
        MEMBER=$3
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

}

function confirm() {
  echo "confirming request id '$1' by member '$2'"
  near view $MULTISIG_ACCOUNT get_request '{"request_id": '$1'}'
  near view $MULTISIG_ACCOUNT get_confirmations '{"request_id": '$1'}'
  near call $MULTISIG_ACCOUNT confirm '{"request_id": '$1'}' --accountId $2 --gas 300000000000000  --depositYocto 1
}

function execute() {
  echo "executing request id '$1' by account '$2'"
  near view $MULTISIG_ACCOUNT get_request '{"request_id": '$1'}'
  near view $MULTISIG_ACCOUNT get_confirmations '{"request_id": '$1'}'
  near call $MULTISIG_ACCOUNT execute '{"request_id": '$1'}' --accountId $2 --gas 300000000000000
}

function set_req_limit() {
  echo "set multisig active request limit to '$1'"
  near call $MULTISIG_ACCOUNT add_request_and_confirm '{
    "request": {
      "receiver_id": "'$MULTISIG_ACCOUNT'",
      "actions": [
        {
          "type": "SetActiveRequestsLimit",
            "active_requests_limit": '$1'
        }
      ]
    }
  }' --accountId $2 --gas 300000000000000  --depositYocto 1
}

function request_and_confirm() {
  prepare_request $@

  near call $MULTISIG_ACCOUNT add_request_and_confirm '{
    "request": {
      "receiver_id": "'$RECEIVER'",
      "actions": [
        {
          "type": "FunctionCall",
            "method_name": "'$METHOD'",
            "args": "'$ARGS'",
            "deposit": "0",
            "gas": "150000000000000"
        }
      ]
    }
  }' --accountId $MEMBER --gas 300000000000000  --depositYocto 1
}

if [[ $# -gt 0 ]]; then
  case $1 in
    request)
      shift
      request $@
      ;;
    request_and_confirm)
      shift
      request_and_confirm $@
      ;;
    confirm)
      if [[ $# == 3 ]]; then
        shift
        confirm $@
      else
        printHelp
        exit 1
      fi
      ;;
    execute)
      if [[ $# == 3 ]]; then
        shift
        execute $@
      else
        printHelp
        exit 1
      fi
      ;;
    set_req_limit)
      if [[ $# == 3 ]]; then
        shift
        set_req_limit $@
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
