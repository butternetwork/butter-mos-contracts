# Barter Launch Doc

This doc provides step-to-step guid to help whoever relevant to setup your own Barter Network from very scratch, or it can be used to set up your own asset cross-chain service using MAP Protocol as infra.



## Table of contents

1. [Deploy Smart Contracts](#deploycontracts)
2. [Initialize Smart Contracts](#initialization)
3. [Add Token Pairs](#addtokenpairs)
4. [Deposit Token](#deposittoken)
5. [Setup Messenger](#messenger)



## Deploy Smart Contracts<a name = "deploycontracts"/>

First thing you need to do is to deploy all necessary smart contracts to differen

### On MAP Relay Chain

There are three smart contracts we need to deploy on MAP Relay Chain:



#### `MAPCrossChainServiceRelay.sol`

`MAPCrossChainServiceRelay.sol` is perhaps the most important smart contract in the entire system. It acts as a relay for every single cross-chain transaction. It is responsible for proof verification, what event to emit and processing relative event coming from other blockchains.



#### `FeeCenter.sol`

`FeeCenter.sol` handles fee related functions.



#### `TokenRegister.sol`

`TokenRegister.sol` handles token mapping. Specifically which token from blockchain A correspond to which token from blockchain B.



### On EVM Chain

There are only one smart contract need to be deployed on EVM compitable blockchains:



#### `MAPCrossChainService.sol`

Just like `MAPCrossChainServiceRelay.sol`, it handles proof verification, what event to emit and processing relative event coming from MAP Relay Chain.



### On Near

#### `MAPCrossChainService`

Rust version of MAP Cross-chain Service. It basically does the same thing but written in Rust Language.





## Initialize Smart Contracts<a name = "initialization"/>

Right now we have all necessary contracts deployed. However we have to initialize all MAP Cross-chain Service smart contracts first before using them.



### Call `Initialize(...)`

For every MCS smart contract deployed on each chain, we need to call the `initialize(...)` methods, it takes three parameters:

`wToken`: address of the wrapped native token, in MAP Relay Chain it will be the address of wMAP, in Ethereum it will be the address of wETH, in Near it will be wrap.near, etc..

`mapToken`: the address of the MAP Token on target chain. For MCSRelay on MAP Relay chain it will be zero address, for MCS smart contract on ethereum this will be the address of MAP Token on Ethereum network.

`lightclient`: the address of light client on target blockchain, light client is responsible for verifying proofs coming from connected blockchains.



### Call `setBridge(...)`

`setBridge` methods mark certain bridge address as 'allowed' in MCS. It allows MCS smart contract know which MCS address(MCS address = Bridge address) is 'legit'. For example if the mcs address on MAP Relay Chain is 0x1234..., then MCS contract on ethereum should call `setBridge('0x1234...') ` in order to allow processing messages from '0x1234...', which is the legit mcs address on MAP Relay Chain.



### Call `setFeeCenter(...)`(only on MCSRelay)

MCSRelay smart contract on MAP relay chain needs to call `setFeeCenter(address)`to set the correct fee center that handles all the fee related functionalities.



### Call `setTokenRegister(...)`(only on MCSRelay)

MCSRelay smart contract on MAP relay chain needs to call `setTokenRegister(address)`to set the correct token register that handles all the token mappings. i.e. which token on src chain map to which token on target chain.



Now we have successfully initalized all the smart contracts, but we can't bridge token yet, we need to tell mcs which token can be bridged.



## Add Token Pairs<a name = "addtokenpairs"/>

Add token pairs from two blockchains, this allows our system know which token from blockchain A can be bridged to which token from blockchain B. Serveral smart contract methods need to be called:

1. Call MCS's `setCanBridgeToken(...)` on non-MAP blockchain to indicate which token can be bridged out. For instance, if you want to bridge tokenA from Ethereum, you need to call `setCanBridgeToken(tokenA.address, toChainId, true)` to let ethereum's mcs know tokenA can be bridged to blockchain with `toChainId`
2. Call FeeCenter's `setChainTokenGasFee(toChainId, srcToken, feeRate)` to set up fee rate for certain token.
3. Call TokenRegister's `registerToken()` method to register token pair.
4. Call MCSRelay's `setTOkenOtherChainDecimals()` for different token unit convertion.

Now we can bridge certain token from one chain to another. Next we need to add some funds to our `Vault`



## Deposit Token<a name = "deposittoken"/>

After adding token pairs, we can now deposit some token as reserve in the `Vault (MAPVaultToken.sol)`. Every token should have a corresponding `vault` contract to store the token.

Now all we need is 'messenger' between connected chains to transmit message.



## Setup Messengers<a name = "messenger"/>

For every blockchain connected to MAP Relay Chain, we need a messenger between them.

#### Messenger between MAP and EVM blockchain

Just run compass messenger.

#### Messenger between MAP and Near

For messenger between MAP and Near, we need more supported services.

1. AWS S3: sync blocks from S3 buckets to Redis
2. Redis: store near block info

