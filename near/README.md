# MAP cross-chain service

The project includes 4 types of contracts, which are:
1. **multisig contract**: owner account of map light client contract and mcs contract to avoid centralization risk
2. **mcs factory contract**: factory contract to create multisig contract and mcs contract
3. **mcs contract**: MAP cross chain service contract
4. **mcs token contract**: NEP-141 token created by mcs contract

## Pre-requisites

**1. rust**

Follow [these instructions](https://doc.rust-lang.org/book/ch01-01-installation.html) for setting up Rust.
Then, add the **wasm32-unknown-unknown** toolchain which enables compiling Rust to Web Assembly (wasm), the low-level language used by the NEAR platform.

```shell
# Get Rust in linux and MacOS
curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
source $HOME/.cargo/env

# Add the wasm toolchain
rustup target add wasm32-unknown-unknown
```

**2. near-cli**
   
The NEAR Command Line Interface (CLI) is a tool that enables to interact with the NEAR network directly from the shell.
Follow [here](https://docs.near.org/tools/near-cli) for installing near-cli. 
Then, select the network and login with your master account.

```shell
# Install near-cli in linux and McsOS
npm install -g near-cli

# The default network for near-cli is testnet, change the network by setting NEAR_ENV
# export NEAR_ENV=mainnet

# login with your master account
near login
```

**3. jq**

Jq is a lightweight and flexible command-line JSON processor. Follow [here](https://stedolan.github.io/jq/download/) to install it.

## Build the contracts

Run below script to build:

```shell
./scripts/build.sh
```

5 wasm files will be generated in directory ./script/res, which are: (the first 2 files are copied from mapclients project)
1. **mcs.wasm**: MAP cross chain service contract
2. **mcs_factory.wasm**: factory contract to deploy and initialize the MCS contract and make MCS contract account in locked state.
3. **mcs_token.wasm**: NEP-141 token contract deployed by MCS contract
4. **mock_map_client.wasm**: mocked MAP light client contract which is for testing
5. **multisig.wasm**: multisig contract


## Deploy the contracts
**1. Configure below parameters in ./scripts/config.sh**

```shell
MASTER_ACCOUNT="map002.testnet" # make sure the account is already created on NEAR blockchain

# factory contract
FACTORY_NAME=mfac # the name of mcs factory contract to be created, the account ID will be $MFACTORY_NAME.$MASTER_ACCOUNT

# multisig contract
MULTISIG_ACCOUNT="multisig.mfac.map009.testnet" # the account of multisig contract
MEMBERS=(member0.map002.testnet member1.map002.testnet member2.map002.testnet)  # the multisig members list

# mos contract
MCS_NAME="mos"  # the name of mcs contract to be created, the account ID will be $MCS_NAME.$MFACTORY_NAME.$MASTER_ACCOUNT
MAP_MCS_ADDRESS="F579c89C22DAc92E9816C0b39856cA9281Bd7BE0"  # the mcs contract address on MAP relay chain
WNEAR_ACCOUNT="wrap.testnet"  # wrapped near contract account on NEAR blockchain
NEAR_CHAIN_ID=5566818579631833089  # NEAR testnet blockchain id, mainnet is 5566818579631833088
MAP_CHAIN_ID=22776  # MAP blockchain ID
CLIENT_ACCOUNT="client.fac.map002.testnet" # the account ID of the map light client contract which has already been deployed
REF_EXCHANGER="ref-finance-101.testnet"
BUTTER_CORE='["core0.corefac.map010.testnet","core1.corefac.map010.testnet"]'
```

**2. Deploy and initialize mos factory contract and mos contract with below command:**
```shell
    # deploy and initialize mos factory contract
    ./scripts/deploy.sh deploy_factory
    
    # deploy and initialize mos contract
    ./scripts/deploy.sh deploy_mos
```

## Usage

We can use the shell scripts in directory ./script to simplify the steps. First run below command to set environment variables:

```shell
source ./scripts/config.sh
```

**NOTE**: in the following examples we are using 2 out of 3 multisig schema.


**1. Support new NEP-141 mcs token to cross chain through MCS service**
```shell
    MCS_TOKEN_NAME="mcs_token_0"  # the mcs token name, the token account will be $MCS_TOKEN_NAME.$MCS_FACTORY_ACCOUNT
    MCS_TOKEN=$MCS_TOKEN_NAME.$MCS_FACTORY_ACCOUNT # mcs token account ID
    DECIMALS=24
    USER_ACCOUNT="map002.testnet"
    
    # deploy mcs token contract
    ./scripts/manage_mcs_token.sh deploy $MCS_TOKEN_NAME
    
    # request to set metadata by multisig member
    ./scripts/manage_multisig.sh request_and_confirm metadata $MCS_TOKEN $DECIMALS ${MEMBERS[1]}
    
    # the request ID can be obtained from the last line of last command's output
    REQUEST_ID=
    
    # confirm the request by another member
    ./scripts/manage_multisig.sh confirm $REQUEST_ID ${MEMBERS[2]}
    
    # if the request is not executed because of the time lock, anyone can execute it after REQUEST_LOCK time
    # ./scripts/manage_multisig.sh execute $REQUEST_ID $USER_ACCOUNT
```

**2. Allow the mcs/ft/native token to transfer to a specified target blockchain**

First set the chain type of target blockchain. Currently only **EvmChain** type is supported.
```shell
    TO_CHAIN=212 # to chain ID
    CHAIN_TYPE="EvmChain"  # to chain type
    
    # request to set chain type by multisig member
    ./scripts/manage_multisig.sh request_and_confirm chain_type $TO_CHAIN $CHAIN_TYPE ${MEMBERS[1]}
    
    # the request ID can be obtained from the last line of last command's output
    REQUEST_ID=
    
    # confirm the request by another member
    ./scripts/manage_multisig.sh confirm $REQUEST_ID ${MEMBERS[2]}
    
    # if the request is not executed because of the time lock, anyone can execute it after REQUEST_LOCK time
    # ./scripts/manage_multisig.sh execute $REQUEST_ID $MASTER_ACCOUNT
```

Then register the mcs/ft token to MOS.
```shell
    TOKEN="usdt.map007.testnet" # token Account Id
    MINTABLE=true               # the token is mintable
    
    # register the ft token
    ./scripts/manage_ft_token.sh register $TOKEN $MINTABLE
    
    TOKEN="wrap.testnet"        # token Account Id
    MINTABLE=false               # the token is not mintable
    
    ./scripts/manage_ft_token.sh register $TOKEN $MINTABLE
```

If you want to add target chain ID to mcs token, run below commands:

```shell
    TO_CHAIN=212 # to chain ID
    MCS_TOKEN_NAME="mcs_token_0"
    MCS_TOKEN=$MCS_TOKEN_NAME.$MCS_ACCOUNT  # mcs token account ID
    
    # request to add target chain ID to mcs token by multisig member
    ./scripts/manage_multisig.sh request_and_confirm add_mcs $MCS_TOKEN $TO_CHAIN ${MEMBERS[1]}
    
    # the request ID can be obtained from the last line of last command's output
    REQUEST_ID=
    
    # confirm the request by another member
    ./scripts/manage_multisig.sh confirm $REQUEST_ID ${MEMBERS[2]}
    
    # if the request is not executed because of the time lock, anyone can execute it after REQUEST_LOCK time
    # ./scripts/manage_multisig.sh execute $REQUEST_ID $MASTER_ACCOUNT
    
    # view the token list to check if the chain ID is added successfully
    ./scripts/manage_mcs_token.sh list
```

If you want to add target chain ID to ft token, run below commands:

```shell
    TO_CHAIN=212 # to chain ID
    FT_TOKEN="wrap.testnet"  # ft token account ID
    
    # request to add target chain ID to ft token by multisig member
    ./scripts/manage_multisig.sh request_and_confirm add_ft $FT_TOKEN $TO_CHAIN ${MEMBERS[1]}
    
    # the request ID can be obtained from the last line of last command's output
    REQUEST_ID=
    
    # confirm the request by another member
    ./scripts/manage_multisig.sh confirm $REQUEST_ID ${MEMBERS[2]}
    
    # if the request is not executed because of the time lock, anyone can execute it after REQUEST_LOCK time
    # ./scripts/manage_multisig.sh execute $REQUEST_ID $MASTER_ACCOUNT
    
    # view the token list to check if the chain ID is added successfully
    ./scripts/manage_ft_token.sh list
```

If you want to add target chain ID to native token, run below commands:

```shell
    TO_CHAIN=212 # to chain ID
    
    # request to add target chain ID to native token by multisig member
    ./scripts/manage_multisig.sh request_and_confirm add_native $TO_CHAIN ${MEMBERS[1]}
    
    # the request ID can be obtained from the last line of last command's output
    REQUEST_ID=
    
    # confirm the request by another member
    ./scripts/manage_multisig.sh confirm $REQUEST_ID ${MEMBERS[2]}
    
    # if the request is not executed because of the time lock, anyone can execute it after REQUEST_LOCK time
    # ./scripts/manage_multisig.sh execute $REQUEST_ID $MASTER_ACCOUNT
    
    # view the token list to check if the chain ID is added successfully
    ./scripts/manage_native_token.sh list
```


**3. Deposit token to MAP relay chain through MOS**

Deposit out mcs token:

```shell
    FROM="map001.testnet"  # sender account ID on NEAR blockchain
    TO="0x2E784874ddB32cD7975D68565b509412A5B519F4" # address on target blockchain
    AMOUNT=100000000000000000000000
    MCS_TOKEN="mcs_token_0".$MCS_ACCOUNT  # mcs token account ID
    
    # get the token balance of the sender
    ./scripts/manage_mcs_token.sh balance $MCS_TOKEN $FROM
    
    # transfer mcs token to receiver on target chain, make sure sender has enough token
    ./scripts/manage_mcs_token.sh deposit $MCS_TOKEN $FROM $TO $AMOUNT
    
    # get the token balance of the sender to check if the token was transferred out successfully
    ./scripts/manage_mcs_token.sh balance $MCS_TOKEN $FROM
```

Deposit out ft token:
```shell
    FROM="map001.testnet"
    TO="0x2E784874ddB32cD7975D68565b509412A5B519F4"
    AMOUNT=100000000000000000000000
    FT_TOKEN="wrap.testnet"  # ft token account ID
    
    # get the token balance of the sender
    ./scripts/manage_ft_token.sh balance $FT_TOKEN $FROM
    
    # transfer ft token to receiver on target chain, make sure sender has enough token
    ./scripts/manage_ft_token.sh deposit $FT_TOKEN $FROM $TO $AMOUNT
    
    # get the token balance of the sender to check if the token was transferred out successfully
    ./scripts/manage_ft_token.sh balance $FT_TOKEN $FROM
```

Deposit out native token:
```shell
    FROM="map001.testnet"
    TO="[46,120,72,116,221,179,44,215,151,93,104,86,91,80,148,18,165,181,25,244]"
    AMOUNT=100000000000000000000000
    
    # get the token balance of the sender
    ./scripts/manage_native_token.sh balance $FROM
    
    # transfer native token to receiver on target chain, make sure sender has enough token
    ./scripts/manage_native_token.sh deposit $TO_CHAIN $FROM $TO $AMOUNT
    
    # get the token balance of the sender to check if the token was transferred out successfully
    ./scripts/manage_native_token.sh balance $FROM
```

## Upgrade the contracts

The mcs contract and mcs token contract can be upgraded through multisig contract.

### 1. Upgrade mcs contract

**Before upgrading mcs contract, everything (transfer in, transfer out, deposit out...) should be paused.**

```shell
PAUSED_MASK=63  # pause everything

# request to pause everything by multisig member
./scripts/manage_multisig.sh request_and_confirm set_paused $PAUSED_MASK ${MEMBERS[1]}
    
# the request ID can be obtained from the last line of last command's output
REQUEST_ID=
    
# confirm the request by another member
./scripts/manage_multisig.sh confirm $REQUEST_ID ${MEMBERS[2]}

# if the request is not executed because of the time lock, anyone can execute it after REQUEST_LOCK time
# ./scripts/manage_multisig.sh execute $REQUEST_ID $MASTER_ACCOUNT
```

**Then upgrade the mcs contract code.**

The first multisig member should use **[mcs upgrade tool](https://github.com/PandaRR007/mcs-upgrade-tool)** to add request and confirm.

The tool output contains a link to the transaction detail. You can get the request ID from the NEAR explorer.

Other multisig member can confirm and execute the request using below command:

```shell
# the request ID can be obtained from the transaction detail in NEAR explorer
REQUEST_ID=
    
# confirm the request by another member
./scripts/manage_multisig.sh confirm $REQUEST_ID ${MEMBERS[2]}

# if the request is not executed because of the time lock, anyone can execute it after REQUEST_LOCK time
# ./scripts/manage_multisig.sh execute $REQUEST_ID $MASTER_ACCOUNT
```

**Set the mcs contract state if new state is added to the contract struct.**

E.g, if "map_chain_id" is added, set it using below command:

```shell
MAP_CHAIN_ID="22776"  # MAP chain ID

# request to set new map light client account by multisig member
./scripts/manage_multisig.sh request_and_confirm map_chain_id $MAP_CHAIN_ID ${MEMBERS[1]}
    
# the request ID can be obtained from the last line of last command's output
REQUEST_ID=
    
# confirm the request by another member
./scripts/manage_multisig.sh confirm $REQUEST_ID ${MEMBERS[2]}

# if the request is not executed because of the time lock, anyone can execute it after REQUEST_LOCK time
#./scripts/manage_multisig.sh execute $REQUEST_ID $MASTER_ACCOUNT
```

**Finally, unpause everything.**

```shell
PAUSED_MASK=0  # unpause everything

# request to unpause everything by multisig member
./scripts/manage_multisig.sh request_and_confirm set_paused $PAUSED_MASK ${MEMBERS[1]}
    
# the request ID can be obtained from the last line of last command's output
REQUEST_ID=
    
# confirm the request by another member
./scripts/manage_multisig.sh confirm $REQUEST_ID ${MEMBERS[2]}

# if the request is not executed because of the time lock, anyone can execute it after REQUEST_LOCK time
# ./scripts/manage_multisig.sh execute $REQUEST_ID $MASTER_ACCOUNT
```


### 2. Upgrade mcs token contract

**NOTE**: currently the script works on MacOS only.
```shell
MCS_TOKEN_WASM_FILE=/path/to/mcs/token/contract  # new mcs token contract wasm file
MCS_TOKEN="mcs_token_0".$MCS_ACCOUNT

# request to upgrade mcs token contract by multisig member
./scripts/manage_multisig.sh request_and_confirm upgrade_mcs_token $MCS_TOKEN $MCS_TOKEN_WASM_FILE ${MEMBERS[1]}
    
# the request ID can be obtained from the last line of last command's output
REQUEST_ID=
    
# confirm the request by another member
./scripts/manage_multisig.sh confirm $REQUEST_ID ${MEMBERS[2]}

# if the request is not executed because of the time lock, anyone can execute it after REQUEST_LOCK time
# ./scripts/manage_multisig.sh execute $REQUEST_ID $MASTER_ACCOUNT
```

### 3. Set new MAP light client contract account

The MCS contract supports updating the MAP light client contract account to a new one if the old one is deprecated.

**Before setting new client, the transfer in function should be paused.**

```shell
PAUSED_MASK=2  # pause transfer in

# request to pause transfer in by multisig member
./scripts/manage_multisig.sh request_and_confirm set_paused $PAUSED_MASK ${MEMBERS[1]}
    
# the request ID can be obtained from the last line of last command's output
REQUEST_ID=
    
# confirm the request by another member
./scripts/manage_multisig.sh confirm $REQUEST_ID ${MEMBERS[2]}

# if the request is not executed because of the time lock, anyone can execute it after REQUEST_LOCK time
# ./scripts/manage_multisig.sh execute $REQUEST_ID $MASTER_ACCOUNT
```

**Then set the new client account.**

```shell
NEW_CLIENT_ACCOUNT="new_client1.testnet"  # new MAP light client account ID

# request to set new map light client account by multisig member
./scripts/manage_multisig.sh request_and_confirm set_client $NEW_CLIENT_ACCOUNT ${MEMBERS[1]}
    
# the request ID can be obtained from the last line of last command's output
REQUEST_ID=
    
# confirm the request by another member
./scripts/manage_multisig.sh confirm $REQUEST_ID ${MEMBERS[2]}

# if the request is not executed because of the time lock, anyone can execute it after REQUEST_LOCK time
#./scripts/manage_multisig.sh execute $REQUEST_ID $MASTER_ACCOUNT
```

**Finally, unpause transfer in function.**

```shell
PAUSED_MASK=0  # unpause everything

# request to unpause everything by multisig member
./scripts/manage_multisig.sh request_and_confirm set_paused $PAUSED_MASK ${MEMBERS[1]}
    
# the request ID can be obtained from the last line of last command's output
REQUEST_ID=
    
# confirm the request by another member
./scripts/manage_multisig.sh confirm $REQUEST_ID ${MEMBERS[2]}

# if the request is not executed because of the time lock, anyone can execute it after REQUEST_LOCK time
# ./scripts/manage_multisig.sh execute $REQUEST_ID $MASTER_ACCOUNT
```

### 4. Upgrade multisig contract

**NOTE**: currently the script works on MacOS only.
```shell
MULTISIG_WASM_FILE=/path/to/multisig/contract  # new multisig contract wasm file

# request to upgrade multisig contract by multisig member
./scripts/manage_multisig.sh request_and_confirm upgrade_multisig $MULTISIG_WASM_FILE ${MEMBERS[1]}
    
# the request ID can be obtained from the last line of last command's output
REQUEST_ID=
    
# confirm the request by another member
./scripts/manage_multisig.sh confirm $REQUEST_ID ${MEMBERS[2]}

# if the request is not executed because of the time lock, anyone can execute it after REQUEST_LOCK time
# ./scripts/manage_multisig.sh execute $REQUEST_ID $MASTER_ACCOUNT
```


### 4. Add butter core

```shell
# request to add butter core by multisig member
CORE=core0.corefac.maplabs.testnet

./scripts/manage_multisig.sh request_and_confirm add_core $CORE ${MEMBERS[1]}
    
# the request ID can be obtained from the last line of last command's output
REQUEST_ID=
    
# confirm the request by another member
./scripts/manage_multisig.sh confirm $REQUEST_ID ${MEMBERS[2]}

# if the request is not executed because of the time lock, anyone can execute it after REQUEST_LOCK time
# ./scripts/manage_multisig.sh execute $REQUEST_ID $MASTER_ACCOUNT
```

### 5. Clean idle butter cores

```shell
# request to clean idle butter cores by multisig member
./scripts/manage_multisig.sh request_and_confirm clean_core ${MEMBERS[1]}
    
# the request ID can be obtained from the last line of last command's output
REQUEST_ID=
    
# confirm the request by another member
./scripts/manage_multisig.sh confirm $REQUEST_ID ${MEMBERS[2]}

# if the request is not executed because of the time lock, anyone can execute it after REQUEST_LOCK time
# ./scripts/manage_multisig.sh execute $REQUEST_ID $MASTER_ACCOUNT
```

### 6. Reset working butter core to idle

```shell
# request to reset butter core by multisig member
CORE=core0.corefac.maplabs.testnet

# request to clean idle butter cores by multisig member
./scripts/manage_multisig.sh request_and_confirm reset_core $CORE ${MEMBERS[1]}
    
# the request ID can be obtained from the last line of last command's output
REQUEST_ID=
    
# confirm the request by another member
./scripts/manage_multisig.sh confirm $REQUEST_ID ${MEMBERS[2]}

# if the request is not executed because of the time lock, anyone can execute it after REQUEST_LOCK time
# ./scripts/manage_multisig.sh execute $REQUEST_ID $MASTER_ACCOUNT
```

### 7. Add butter entrance info

```shell
ENTRANCE_HASH=d30f28e06f2e66cfe7ed43d967a5c499a8d331d157d800bf773b9640b560b142  # sha256 of butter entrance
FEE_RATE=7000 # fee rate of butter entrance, base rate is 1000000
FEE_RECEIVER=map.testnet  # fee receiver account ID, if FEE_RATE is 0, this field should be set as 0xffffffffffffffffffffffffffffffffffffffff

# request to set butter entrance info by multisig member
./scripts/manage_multisig.sh request_and_confirm set_entrance $ENTRANCE_HASH $FEE_RATE $FEE_RECEIVER ${MEMBERS[1]}
    
# the request ID can be obtained from the last line of last command's output
REQUEST_ID=
    
# confirm the request by another member
./scripts/manage_multisig.sh confirm $REQUEST_ID ${MEMBERS[2]}

# if the request is not executed because of the time lock, anyone can execute it after REQUEST_LOCK time
# ./scripts/manage_multisig.sh execute $REQUEST_ID $MASTER_ACCOUNT

# view all entrance info
near view $MCS_ACCOUNT list_swap_entrance
```


## Testing
1. How to run unit testing?

```shell
cargo test --workspace --lib
```

2. How to run integration testing?


**NOTE**: Before run the integration testing, make sure **near sandbox** exists on your computer.
If not, please clone the [nearcore](https://github.com/near/nearcore) project and run "make sandbox" to build it.


```shell
# set below environment before run tests
export NEAR_SANDBOX_BIN_PATH="/path/to/near/sandbox/bin"

cargo test
```