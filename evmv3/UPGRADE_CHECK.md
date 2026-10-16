# upgrade:check Guide

`upgrade:check` is a pre-upgrade Hardhat task. Run it before any real `*:upgrade` task to catch common upgrade issues early.

It performs two checks:

1. Static storage layout compatibility check.
2. Realistic upgrade simulation on a Hardhat fork.

The task does not upgrade contracts on a real network. The fork simulation takes an EVM snapshot and reverts it after the simulated upgrade.

## Supported Targets

The task has built-in configs for these `--target` values:

| target             | New implementation contract | Proxy source                               |
| ------------------ | --------------------------- | ------------------------------------------ |
| `bridge`           | `Bridge`                    | `bridgeProxy` in `deployments/deploy.json` |
| `relay`            | `BridgeAndRelay`            | `bridgeProxy` in `deployments/deploy.json` |
| `register`         | `TokenRegisterV3`           | `registerV3`, fallback to `registerProxy`  |
| `ProtocolFee`      | `ProtocolFee`               | `ProtocolFee`                              |
| `DepositWhitelist` | `DepositWhitelist`          | `DepositWhitelist`                         |

For a UUPS proxy that is not listed above, pass `--contract` and `--proxy` manually.

## Common Commands

Run the full check: storage layout + fork simulation.

```bash
npx hardhat upgrade:check --target register --deployment-network Mapo --fork-network Mapo --network hardhat
```

Run only the storage layout check:

```bash
npx hardhat upgrade:check --target DepositWhitelist --deployment-network Mapo --fork-network Mapo --skip-fork --network hardhat
```

Run only the fork simulation:

```bash
npx hardhat upgrade:check --target register --deployment-network Mapo --fork-network Mapo --skip-storage --network hardhat
```

Simulate with an already deployed new implementation:

```bash
npx hardhat upgrade:check --target bridge --deployment-network Mapo --fork-network Mapo --impl 0xNewImplementation --network hardhat
```

Manually provide the proxy and contract:

```bash
npx hardhat upgrade:check --contract ProtocolFee --proxy 0xProxy --fork-network Mapo --deployment-network Mapo --network hardhat
```

## Options

### Target And Addresses

| Option                 | Description                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `--target`             | Use a built-in target config, for example `bridge`, `register`, or `ProtocolFee`                     |
| `--contract`           | New implementation contract name, or a fully qualified name like `contracts/X.sol:X`                 |
| `--proxy`              | Proxy address. If omitted, it is resolved from `deployments/deploy.json` by `--target`               |
| `--impl`               | Already deployed new implementation address. If omitted, the fork simulation deploys one temporarily |
| `--deployment-network` | Network key used when reading `deployments/deploy.json`, for example `Mapo`                          |

### Fork Simulation

| Option             | Description                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| `--fork-network`   | Use the RPC URL from `hardhat.config.js` for this network as the fork source                                 |
| `--fork-rpc-url`   | Custom fork RPC URL. This overrides `--fork-network`                                                         |
| `--fork-block`     | Fixed fork block number. `0` means latest                                                                    |
| `--from`           | Upgrade sender to impersonate on the fork                                                                    |
| `--log-from-block` | Start block for scanning AccessManager `RoleGranted` logs. Default is `0`                                    |
| `--upgrade-call`   | Upgrade function to call. Built-in targets default to `upgradeToAndCall`; `upgradeTo` is also supported      |
| `--data`           | Second argument for `upgradeToAndCall`. Default is `0x`                                                      |
| `--skip-fork`      | Skip the upgrade simulation. Storage checking may still reset a fork to read current implementation bytecode |

Fork simulation must run on Hardhat Network, so include `--network hardhat`.

Upgrade sender resolution order:

1. If `--from` is provided, impersonate that address.
2. If the proxy exposes `UPGRADER_ROLE` and `getRoleMember`, use the first upgrader role member.
3. If the proxy uses OpenZeppelin `AccessManager`, read `authority()`, scan `RoleGranted` logs, then call `canCall(account, proxy, upgradeToAndCall)` to find an account that can upgrade immediately.
4. If no immediate upgrade sender can be found, the task fails and asks you to pass `--from`.

### Storage Layout

| Option                                   | Description                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------- |
| `--reference`                            | Old implementation contract name or `source:contract`; used as the old storage layout |
| `--reference-build-info`                 | Build-info file containing the old implementation layout                              |
| `--new-build-info`                       | Build-info file containing the new implementation layout                              |
| `--explorer-api-url`                     | Override the block explorer API URL used to fetch the old implementation source       |
| `--explorer-api-key`                     | Override the block explorer API key                                                   |
| `--skip-explorer`                        | Skip block explorer lookup and only match local build-info by on-chain bytecode       |
| `--allow-renames`                        | Allow storage variable renames                                                        |
| `--unsafe-allow-custom-types`            | Allow custom type changes that OpenZeppelin cannot fully infer                        |
| `--unsafe-skip-reference-bytecode-check` | Do not require `--reference` bytecode to match the current on-chain implementation    |
| `--skip-storage`                         | Skip the storage layout check                                                         |

By default, the task reads the current ERC-1967 implementation slot from the proxy, gets the current on-chain implementation address, fetches that implementation's verified source from the configured block explorer, recompiles it with the explorer compiler settings, and uses the resulting storage layout as the old layout.

This is intentional. The old layout must describe the implementation that is currently live behind the proxy. If the old local source was overwritten by new code, a local artifact can silently compare "new layout vs new layout" and produce a false pass.

The default explorer path has a bytecode guard:

1. Fetch verified source for the current implementation address.
2. Recompile it with the exact explorer compiler version and settings.
3. Match the compiled deployed bytecode to the current on-chain implementation bytecode, ignoring metadata and immutable-value placeholders.
4. Use the matched contract's `storageLayout` as the old layout.

If the explorer lookup fails, the task falls back to local `artifacts/build-info` only when it can match the current on-chain implementation bytecode to a local build-info contract. This fallback is still bytecode-checked. If neither explorer source nor local bytecode matching works, the task fails.

Important: storage layout cannot be reconstructed from chain. The old layout must come from the old implementation build-info. If the old source/artifact was overwritten by new code and you pass that overwritten artifact as `--reference`, the comparison can degrade into "new layout vs new layout" and become meaningless.

To prevent this, when `--reference` is used, the task also checks that the reference deployed bytecode matches the current on-chain implementation bytecode. If it does not match, the task fails instead of producing a false pass.

If the current on-chain implementation cannot be loaded from explorer and cannot be matched to local build-info, the task fails with an error like this:

```text
Cannot load old storage layout for current implementation 0x...
Verify the implementation on the block explorer, pass --explorer-api-url, or provide the old build-info with --reference-build-info.
```

If the explorer is not configured in `hardhat.config.js`, pass it explicitly:

```bash
npx hardhat upgrade:check --target register --deployment-network Mapo --fork-network Mapo --explorer-api-url https://explorer-api.chainservice.io/api --network hardhat
```

If the explorer source is unavailable, provide the old layout explicitly:

```bash
npx hardhat upgrade:check --target register --deployment-network Mapo --fork-network Mapo --reference contracts/TokenRegisterV3.sol:TokenRegisterV3 --reference-build-info artifacts/build-info/old-implementation.json --network hardhat
```

If several build-info files contain a contract with the same name, prefer a fully qualified name or an explicit build-info path:

```bash
npx hardhat upgrade:check --target register --deployment-network Mapo --fork-network Mapo --reference contracts/TokenRegisterV3.sol:TokenRegisterV3 --reference-build-info artifacts/build-info/old.json --network hardhat
```

Only use `--unsafe-skip-reference-bytecode-check` if you have manually verified that the provided reference layout is the exact old layout even though its bytecode does not match the current chain implementation. This is intentionally unsafe because it can hide a bad upgrade.

Use `--skip-explorer` only when you intentionally want to avoid explorer lookup. The task will still require a bytecode match against local build-info before using any local old layout.

For contracts such as `ProtocolFee` that use an enum as a mapping key, OpenZeppelin may conservatively report `Insufficient data to compare enums`. If you have manually confirmed the enum did not change, add:

```bash
--unsafe-allow-custom-types
```

## Success Output

For a full check, success looks like this:

```text
Storage layout check passed: ...
Fork upgrade simulation passed.
Upgrade pre-check passed.
```

If you pass `--skip-fork`, `Fork upgrade simulation passed.` will not appear. Storage checking may still use a fork to read the current implementation bytecode.

If you pass `--skip-storage`, `Storage layout check passed: ...` will not appear.

## Important Notes

- This task does not replace manual review. It catches common issues such as incompatible storage layout, missing upgrade permission, UUPS validation failure, or an implementation address with no code.
- The fork simulation deploys a temporary new implementation by default. If the real upgrade will use an already deployed implementation, pass `--impl`.
- If AccessManager requires delayed execution, the automatic immediate-call simulation will fail. In that case, confirm the real schedule/execute flow separately or extend the simulation to match the production process.
- Old storage layout cannot be read directly from chain. By default this task gets it by recompiling the current implementation's verified explorer source and bytecode-checking it against chain.
- Real upgrade tasks such as `bridge:upgrade` and `register:upgrade` still need to be executed separately. `upgrade:check` is only the pre-upgrade check.
