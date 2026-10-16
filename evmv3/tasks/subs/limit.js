let { create } = require("../../utils/create.js");
const { getDeployment, saveDeployment, getToken, getBridgeLimitList } = require("../utils/utils");
const { verify } = require("../../utils/verify");

// BridgeLimit.BucketKind - keep in sync with IBridgeLimit.sol's enum order.
const BUCKET_KIND = { transit: 0, mapoOut: 1, mapoIn: 2 };

async function getLimit(hre, contractAddress) {
  let addr = contractAddress;
  if (contractAddress === "" || contractAddress === "latest") {
    addr = await getDeployment(hre.network.name, "bridgeLimit");
  }

  let limit = await hre.ethers.getContractAt("BridgeLimit", addr);

  console.log("BridgeLimit address:", limit.address);
  return limit;
}

function resolveBucketKind(name) {
  const kind = BUCKET_KIND[name];
  if (kind === undefined) {
    throw `unknown bucket kind [${name}] - expected one of: ${Object.keys(BUCKET_KIND).join(", ")}`;
  }
  return kind;
}

task("limit:deploy", "Deploy BridgeLimit and wire it into the bridge's service slot 5")
  .addParam("bridge", "the Bridge/BridgeAndRelay proxy address this limit is scoped to")
  .addOptionalParam("auth", "auth address", "0xACC31A6756B60304C03d6626fc98c062E4539CCA", types.string)
  .setAction(async (taskArgs, hre) => {
    const accounts = await hre.ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);

    let implAddr = await create(hre, deployer, "BridgeLimit", ["address"], [taskArgs.bridge], "");

    let BridgeLimit = await hre.ethers.getContractFactory("BridgeLimit");
    let data = BridgeLimit.interface.encodeFunctionData("initialize", [taskArgs.auth]);
    let proxy_salt = process.env.BRIDGE_LIMIT_PROXY_SALT || "";

    let proxyAddr = await create(hre, deployer, "OmniServiceProxy", ["address", "bytes"], [implAddr, data], proxy_salt);

    let limit = BridgeLimit.attach(proxyAddr);

    console.log("bridge:", await limit.bridge());
    console.log("authority:", await limit.authority());

    await saveDeployment(hre.network.name, "bridgeLimit", proxyAddr);

    // Wiring into the bridge itself is a separate, deliberate step - run:
    //   npx hardhat relay:setServiceContract --type 5 --contract <bridgeLimit address>
    // once the buckets below are configured; otherwise every limit check
    // stays a no-op.
    console.log(`\nDeployed. Wire it in with:`);
    console.log(
      `  npx hardhat relay:setServiceContract --type 5 --contract ${proxyAddr} --network ${hre.network.name}`,
    );

    await verify(implAddr, [taskArgs.bridge], "contracts/BridgeLimit.sol:BridgeLimit", hre.network.config.chainId, true);
    await verify(
      proxyAddr,
      [implAddr, data],
      "contracts/OmniServiceProxy.sol:OmniServiceProxy",
      hre.network.config.chainId,
      false,
    );
  });

task("limit:upgrade", "upgrade the BridgeLimit implementation behind the proxy")
  .addOptionalParam("limit", "the BridgeLimit proxy address", "", types.string)
  .addOptionalParam("impl", "implementation address", "", types.string)
  .setAction(async (taskArgs, hre) => {
    const accounts = await hre.ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);

    let limit = await getLimit(hre, taskArgs.limit);

    let implAddr = taskArgs.impl;
    if (implAddr === "") {
      implAddr = await create(hre, deployer, "BridgeLimit", ["address"], [await limit.bridge()], "");
    }

    console.log("pre impl", await limit.getImplementation());
    await (await limit.upgradeToAndCall(implAddr, "0x")).wait();
    console.log("new impl", await limit.getImplementation());
  });

task("limit:update", "Apply constants/bridgeLimit.json to BridgeLimit: the exempt list, the executor whitelist, and each token's three buckets")
  .addOptionalParam("limit", "the BridgeLimit proxy address", "", types.string)
  .addOptionalParam("chain", "the relay chain name as keyed in bridgeLimit.json", "Mapo", types.string)
  .setAction(async (taskArgs, hre) => {
    let limit = await getLimit(hre, taskArgs.limit);

    let tokenLimits = await getBridgeLimitList(taskArgs.chain);

    if (tokenLimits.exempt) {
      console.log(`== exempt initiators ==`);
      for (let entry of tokenLimits.exempt) {
        await (await limit.setExempt(entry.value, true)).wait();
        console.log(`  exempt [${entry.note || ""}]: ${entry.value}`);
      }
    }

    if (tokenLimits.executorWhitelist) {
      console.log(`== relayExecute executor whitelist ==`);
      for (let entry of tokenLimits.executorWhitelist) {
        await (await limit.setExecutorWhitelist(entry.value, true)).wait();
        console.log(`  whitelisted [${entry.note || ""}]: ${entry.value}`);
      }
    }

    for (let symbol in tokenLimits) {
      if (symbol === "exempt" || symbol === "executorWhitelist" || symbol.startsWith("_")) continue;
      let config = tokenLimits[symbol];
      let token = await getToken(taskArgs.chain, symbol);
      let decimals = config.decimals;

      const parse = (amount) => ethers.utils.parseUnits(amount, decimals);

      console.log(`\n== ${symbol} (${token}) ==`);

      for (let bucketName of Object.keys(BUCKET_KIND)) {
        let b = config[bucketName];
        if (!b) continue;
        let kind = resolveBucketKind(bucketName);
        await (await limit.setBucket(token, kind, parse(b.capacity), parse(b.rate), b.enabled)).wait();
        console.log(`  ${bucketName}: capacity=${b.capacity} rate=${b.rate}/s enabled=${b.enabled}`);
      }
    }

    console.log(
      `\nAll buckets in constants/bridgeLimit.json are written with "enabled" exactly as configured there - ` +
        `they stay false (unenforced) until real traffic data backs the capacity/rate numbers.`,
    );
  });

task("limit:setBucket", "set one of a token's three buckets (transit / mapoOut / mapoIn)")
  .addParam("token", "token address")
  .addParam("kind", "transit | mapoOut | mapoIn")
  .addParam("capacity", "max burst size, in the token's own units")
  .addParam("rate", "refill per second")
  .addOptionalParam("enabled", "enable enforcement for this bucket", true, types.boolean)
  .addOptionalParam("limit", "the BridgeLimit proxy address", "", types.string)
  .setAction(async (taskArgs, hre) => {
    let limit = await getLimit(hre, taskArgs.limit);
    let kind = resolveBucketKind(taskArgs.kind);

    await (await limit.setBucket(taskArgs.token, kind, taskArgs.capacity, taskArgs.rate, taskArgs.enabled)).wait();
    console.log(`set ${taskArgs.kind} bucket for ${taskArgs.token}: capacity=${taskArgs.capacity} rate=${taskArgs.rate}`);
  });

task("limit:setTemporaryCapacity", "short, capped emergency capacity bump (<= 2x permanent capacity, <= 24h)")
  .addParam("token", "token address")
  .addParam("kind", "transit | mapoOut | mapoIn")
  .addParam("capacity", "temporary capacity, in the token's own units (must be <= 2x the permanent capacity)")
  .addParam("duration", "seconds until the bump lapses on its own (must be <= 86400)")
  .addOptionalParam("limit", "the BridgeLimit proxy address", "", types.string)
  .setAction(async (taskArgs, hre) => {
    let limit = await getLimit(hre, taskArgs.limit);
    let kind = resolveBucketKind(taskArgs.kind);

    await (
      await limit.setTemporaryCapacity(taskArgs.token, kind, taskArgs.capacity, taskArgs.duration)
    ).wait();
    console.log(
      `set temporary ${taskArgs.kind} capacity for ${taskArgs.token}: capacity=${taskArgs.capacity} for ${taskArgs.duration}s`,
    );
  });

task("limit:setExempt", "exempt (or un-exempt) an initiator from every bucket")
  .addParam("account", "raw bytes identifying the initiator - an EVM address, a Tron address, or a non-EVM identifier such as a Solana pubkey")
  .addOptionalParam("exempt", "true to exempt, false to revoke", true, types.boolean)
  .addOptionalParam("limit", "the BridgeLimit proxy address", "", types.string)
  .setAction(async (taskArgs, hre) => {
    let limit = await getLimit(hre, taskArgs.limit);

    await (await limit.setExempt(taskArgs.account, taskArgs.exempt)).wait();
    console.log(`exempt[${taskArgs.account}] = ${taskArgs.exempt}`);
  });

task("limit:setExecutorWhitelist", "allow (or revoke) a relayExecute target contract")
  .addParam("executor", "the executor contract address")
  .addOptionalParam("allowed", "true to allow, false to revoke", true, types.boolean)
  .addOptionalParam("limit", "the BridgeLimit proxy address", "", types.string)
  .setAction(async (taskArgs, hre) => {
    let limit = await getLimit(hre, taskArgs.limit);

    await (await limit.setExecutorWhitelist(taskArgs.executor, taskArgs.allowed)).wait();
    console.log(`executorWhitelist[${taskArgs.executor}] = ${taskArgs.allowed}`);
  });

task("limit:list", "list a token's three buckets")
  .addParam("token", "token address")
  .addOptionalParam("limit", "the BridgeLimit proxy address", "", types.string)
  .setAction(async (taskArgs, hre) => {
    let limit = await getLimit(hre, taskArgs.limit);

    const printBucket = (label, b) =>
      console.log(
        `  ${label}: enabled=${b.enabled} capacity=${b.capacity} rate=${b.rate} remaining=${b.remaining} ` +
          `tempCapacity=${b.tempCapacity} tempExpiry=${b.tempExpiry}`,
      );

    console.log(`token ${taskArgs.token}:`);
    for (let bucketName of Object.keys(BUCKET_KIND)) {
      printBucket(bucketName, await limit.buckets(taskArgs.token, BUCKET_KIND[bucketName]));
    }
  });

task("limit:unconfigured", "list which of the given tokens are still missing at least one of their three buckets")
  .addParam("tokens", "comma-separated token addresses")
  .addOptionalParam("limit", "the BridgeLimit proxy address", "", types.string)
  .setAction(async (taskArgs, hre) => {
    let limit = await getLimit(hre, taskArgs.limit);

    let tokens = taskArgs.tokens.split(",");
    let result = await limit.unconfigured(tokens);
    console.log(`unconfigured tokens:`, result);
  });
