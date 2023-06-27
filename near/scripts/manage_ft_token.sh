set -e

SCRIPT_DIR=$(dirname $0)
source $SCRIPT_DIR/config.sh
FILE_NAME=$0

function printHelp() {
  echo "Usage:"
  echo "  $FILE_NAME <command>"
  echo "Commands:"
  echo "  list                                                  view registered fungible tokens and their to chains"
  echo "  register <token> <mintable>  transfer out ft token    register token"
  echo "  deposit <token> <from> <to> <amount>                  deposit out ft token"
  echo "  balance <token> <account>                             view account balance of ft token"
  echo "  help                                                  show help"
}
function register() {
    echo "registering token $1"
    near call $MCS_ACCOUNT register_token '{"token":"'$1'", "mintable":'$2'}' --accountId $MASTER_ACCOUNT --deposit 1 --gas 300000000000000
}

function list_tokens() {
  echo "getting fungible token list from mcs contract"
  near view $MCS_ACCOUNT get_fungible_tokens '{}'
}

function deposit_out() {
  echo "deposit out $4 $1 token from $2 to $3 on MAP chain"
  near call $1 ft_transfer_call '{"receiver_id":"'$MCS_ACCOUNT'", "amount":"'$4'", "memo": "", "msg": "{\"type\": \"Deposit\", \"to\": \"'$3'\"}"}' --accountId $2 --depositYocto 1 --gas 60000000000000
}

function balance() {
  echo "get account $2 balance of token $1"
  near view $1 ft_balance_of '{"account_id":"'$2'"}'
}

if [[ $# -gt 0 ]]; then
  case $1 in
    list)
      if [[ $# == 1 ]]; then
        list_tokens
      else
        printHelp
        exit 1
      fi
      ;;
    register)
      if [[ $# == 3 ]]; then
        shift
        register $@
      else
        printHelp
        exit 1
      fi
      ;;
    deposit)
      if [[ $# == 5 ]]; then
        shift
        deposit_out $@
      else
        printHelp
        exit 1
      fi
      ;;
    balance)
      if [[ $# == 3 ]]; then
        shift
        balance $@
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
