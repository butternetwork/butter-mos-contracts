task("mosDeploy",
    "Deploy the upgradeable MapCrossChainService contract and initialize it",
    require("./subs/mosDeploy")
)
    .addParam("wrapped", "native wrapped token address")
    .addParam("lightnode", "lightNode contract address")

task("upgradeMOS",
    "upgrade mos evm contract in proxy",
    require("./subs/upgradeMOS")
)
    .addParam("impl", "The mos impl address")

task("mosList",
    "List mos relay infos",
    require("./subs/mosList")
)
    .addOptionalParam("mos", "The mos address, default mos", "mos", types.string)
    .addOptionalParam("token", "The token address, default wtoken", "wtoken", types.string)

//settype
//client -> Update client manager on relay chain or update light client on other chain
//butterRouter ->  Update butter router contract address in MOS
//tokenregister ->  update tokenRegister for mos in relay chain
task("setUp",
    "set associated contracts for mos",
    require("./subs/setUp")
)
    .addParam("settype", "associated contracts type to set for mos")
    .addParam("address", "associated contracts address")


task("registerChain",
    "Register altchain mos to relay chain or Initialize MapCrossChainServiceRelay address for MapCrossChainService",
    require("./subs/registerChain")
)
    .addParam("address", "mos contract address")
    .addParam("chain", "chain id")
    .addOptionalParam("type", "chain type, default 1", 1, types.int)




// <------------------------------------------------ relay --------------------------------------->

task("relayRegisterToken",
    "Register cross-chain token on relay chain",
    require("./subs/relayRegisterToken")
)
    .addParam("token", "Token address")
    .addParam("vault", "vault token address")
    .addParam("mintable", "token mintable",false,types.boolean)

task("relayMapToken",
    "Map the altchain token to the token on relay chain",
    require("./subs/relayMapToken")
)
    .addParam("token", "token address to relay chain")
    .addParam("chain", "cross-chain id")
    .addParam("chaintoken", "cross-chain token")
    .addOptionalParam("decimals", "token decimals, default 18", 18, types.int)


task("relaySetTokenFee",
    "Set token fee to target chain",
    require("./subs/relaySetTokenFee")
)
    .addParam("token", "relay chain token address")
    .addParam("chain", "target chain id")
    .addParam("min", "One-time cross-chain charging minimum handling fee")
    .addParam("max", "One-time cross-chain charging maximum handling fee")
    .addParam("rate", "The percentage value of the fee charged, unit is 0.000001")

task("relaySetDistributeRate",
    "Set the fee to enter the vault address",
    require("./subs/relaySetDistributeRate")
)
    .addOptionalParam("type", "0 or 1, type 0 is vault, default 0", 0, types.int)
    .addOptionalParam("address", "receiver address", "0x0000000000000000000000000000000000000DEF", types.string)
    .addParam("rate", "The percentage value of the fee charged, unit 0.000001")



//<---------------------------------------------mos----------------------------------------------->

task("mosRegisterToken",
    "MapCrossChainService settings allow cross-chain tokens",
    require("./subs/mosRegisterToken")
)
    .addParam("token", "token address")
    .addParam("chains", "chain ids allowed to cross, separated by ',', ex. `1,2,3` ")
    .addOptionalParam("enable", "true or false", true, types.boolean)


task("mosSetMintableToken",
    "MapCrossChainService settings mintable token",
    require("./subs/mosSetMintableToken")
)
    .addParam("token", "token address")
    .addParam("mintable", "true or false",false,types.boolean)


    

//<-----------------------------------------------utils------------------------------->

task("tokenDeploy",
    "Deploy a token with role control",
    require("./subs/tokenDeploy")
)
    .addParam("name", "token name")
    .addParam("symbol", "token symbol")
    .addOptionalParam("decimals", "default 18", 18, types.int)
    .addOptionalParam("balance", "init balance, default 0", 0, types.int)

task("tokenGrant",
    "Grant a mintable token mint role",
    require("./subs/tokenGrant")
)
    .addParam("token", "token address")
    .addOptionalParam("minter", "minter address, default mos", "mos", types.string)

task("tokenMint",
    "mint token",
    require("./subs/tokenMint")
)
    .addParam("token", "token address")
    .addParam("amount", "mint amount")

task("vaultDeposit",
    "vaultDeposit",
    require("./subs/vaultDeposit.js")
).addParam("fromchain", "fromchainId")


task("depositOutToken",
    "Cross-chain deposit token",
    require("./subs/depositOutToken")
)
    .addParam("mos", "The mos address")
    .addOptionalParam("token", "The token address","0x0000000000000000000000000000000000000000",types.string)
    .addOptionalParam("address", "The receiver address","",types.string)
    .addParam("value", "deposit value, unit WEI")

task("vaultDeploy",
    "Deploy the vault token",
    require("./subs/vaultDeploy")
)
    .addParam("token", "The token address on relay chain")
    .addParam("name", "The name of the vault token")
    .addParam("symbol", "The symbol of the vault token")

task("vaultAddManager",
    "Add vaultToken manager",
    require("./subs/vaultAddManager")
)
    .addParam("vault", "The vault token address")
    .addOptionalParam("manager", "the manager address, default is relay", "relay", types.string)  

    
task("withdraw",
    "withdraw token",
    require("./subs/withdraw")
)
    .addParam("mos", "The mos address")
    .addOptionalParam("token", "The token address","0x0000000000000000000000000000000000000000",types.string)
    .addOptionalParam("address", "The receiver address","",types.string)
    .addParam("value", "withdraw value")


