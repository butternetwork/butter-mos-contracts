const fs = require("fs");
const childProcess = require("child_process");
const http = require("http");
const https = require("https");
const os = require("os");
const path = require("path");
const { task, types } = require("hardhat/config");
const { getStorageUpgradeReport, getVersion, withValidationDefaults } = require("@openzeppelin/upgrades-core");

const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const UPGRADE_TO_AND_CALL_SELECTOR = "0x4f1ef286";

const TARGETS = {
  bridge: {
    contract: "Bridge",
    deploymentKeys: ["bridgeProxy"],
    upgradeCall: "upgradeToAndCall",
  },
  relay: {
    contract: "BridgeAndRelay",
    deploymentKeys: ["bridgeProxy"],
    upgradeCall: "upgradeToAndCall",
  },
  register: {
    contract: "TokenRegisterV3",
    deploymentKeys: ["registerV3", "registerProxy"],
    upgradeCall: "upgradeToAndCall",
  },
  tokenregister: {
    contract: "TokenRegisterV3",
    deploymentKeys: ["registerV3", "registerProxy"],
    upgradeCall: "upgradeToAndCall",
  },
  protocolfee: {
    contract: "ProtocolFee",
    deploymentKeys: ["ProtocolFee"],
    upgradeCall: "upgradeToAndCall",
  },
  depositwhitelist: {
    contract: "DepositWhitelist",
    deploymentKeys: ["DepositWhitelist"],
    upgradeCall: "upgradeToAndCall",
  },
  depositwhitelsit: {
    contract: "DepositWhitelist",
    deploymentKeys: ["DepositWhitelist"],
    upgradeCall: "upgradeToAndCall",
  },
};

function strip0x(value) {
  return value ? value.replace(/^0x/i, "") : "";
}

function with0x(value) {
  return value.startsWith("0x") ? value : `0x${value}`;
}

function parseContractRef(contractRef) {
  const index = contractRef.lastIndexOf(":");
  if (index === -1) {
    return { sourceName: undefined, contractName: contractRef };
  }
  return {
    sourceName: contractRef.slice(0, index),
    contractName: contractRef.slice(index + 1),
  };
}

function getTargetConfig(target) {
  if (!target) {
    return undefined;
  }
  return TARGETS[target.toLowerCase()];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function buildInfoDir(hre) {
  return path.join(hre.config.paths.artifacts, "build-info");
}

function listBuildInfoPaths(hre, explicitPath) {
  if (explicitPath) {
    return [path.resolve(hre.config.paths.root, explicitPath)];
  }

  const dir = buildInfoDir(hre);
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.join(dir, file))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

async function getArtifactBuildInfo(hre, contractRef, explicitBuildInfo) {
  if (explicitBuildInfo) {
    const { sourceName, contractName } = parseContractRef(contractRef);
    if (!sourceName) {
      return findBuildInfoContract(hre, contractRef, explicitBuildInfo);
    }
    const buildInfoPath = path.resolve(hre.config.paths.root, explicitBuildInfo);
    const buildInfo = readJson(buildInfoPath);
    const contract = buildInfo.output.contracts?.[sourceName]?.[contractName];
    if (!contract) {
      throw new Error(`Contract ${contractRef} not found in ${buildInfoPath}`);
    }
    return { buildInfoPath, sourceName, contractName, contract };
  }

  const artifact = await hre.artifacts.readArtifact(contractRef);
  const dbgPath = path.join(hre.config.paths.artifacts, artifact.sourceName, `${artifact.contractName}.dbg.json`);
  const dbg = readJson(dbgPath);
  const buildInfoPath = path.resolve(path.dirname(dbgPath), dbg.buildInfo);
  const buildInfo = readJson(buildInfoPath);
  const contract = buildInfo.output.contracts?.[artifact.sourceName]?.[artifact.contractName];
  if (!contract) {
    throw new Error(`Build info missing ${artifact.sourceName}:${artifact.contractName}`);
  }
  return {
    buildInfoPath,
    sourceName: artifact.sourceName,
    contractName: artifact.contractName,
    contract,
  };
}

function findBuildInfoContract(hre, contractRef, explicitBuildInfo) {
  const { sourceName, contractName } = parseContractRef(contractRef);
  const matches = [];

  for (const buildInfoPath of listBuildInfoPaths(hre, explicitBuildInfo)) {
    const buildInfo = readJson(buildInfoPath);
    for (const [source, contracts] of Object.entries(buildInfo.output.contracts || {})) {
      if (sourceName && source !== sourceName) {
        continue;
      }
      for (const [name, contract] of Object.entries(contracts)) {
        if (name === contractName) {
          matches.push({ buildInfoPath, sourceName: source, contractName: name, contract });
        }
      }
    }
  }

  if (matches.length === 0) {
    throw new Error(`Cannot find storage layout for ${contractRef}`);
  }
  if (matches.length > 1 && !sourceName && !explicitBuildInfo) {
    console.log(
      `Found ${matches.length} build-info matches for ${contractRef}; using newest ${matches[0].sourceName}:${matches[0].contractName}`,
    );
  }
  return matches[0];
}

function requireStorageLayout(info, label) {
  if (!info.contract.storageLayout) {
    throw new Error(`${label} has no storageLayout. Recompile with storageLayout in outputSelection.`);
  }
  return info.contract.storageLayout;
}

function normalizeImmutableReferences(bytecode, immutableReferences) {
  let hex = strip0x(bytecode);
  if (!immutableReferences) {
    return hex;
  }

  for (const refs of Object.values(immutableReferences)) {
    for (const ref of refs) {
      const start = ref.start * 2;
      const length = ref.length * 2;
      if (start + length <= hex.length) {
        hex = `${hex.slice(0, start)}${"0".repeat(length)}${hex.slice(start + length)}`;
      }
    }
  }
  return hex;
}

function bytecodeVersion(bytecode, immutableReferences) {
  return getVersion(with0x(normalizeImmutableReferences(bytecode, immutableReferences))).withoutMetadata;
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    const request = client.get(
      url,
      {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "identity",
          "User-Agent": "hardhat-upgrade-check",
        },
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`Explorer HTTP ${response.statusCode}: ${body.slice(0, 200)}`));
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(new Error(`Explorer returned invalid JSON: ${err.message}`));
          }
        });
      },
    );

    request.setTimeout(30000, () => request.destroy(new Error("Explorer request timed out")));
    request.on("error", reject);
  });
}

function getExplorerConfig(hre, taskArgs, explorerNetwork) {
  const networkConfig = hre.config.networks[explorerNetwork] || {};
  const chainId = networkConfig.chainId;
  const customChain = (hre.config.etherscan?.customChains || []).find(
    (chain) => chain.network === explorerNetwork || (chainId && chain.chainId === chainId),
  );
  const apiKeys = hre.config.etherscan?.apiKey || {};
  let apiKey = "";

  if (typeof apiKeys === "string") {
    apiKey = apiKeys;
  } else {
    apiKey = apiKeys[explorerNetwork] || apiKeys[customChain?.network] || "";
  }

  return {
    apiURL: taskArgs.explorerApiUrl || customChain?.urls?.apiURL || "",
    apiKey: taskArgs.explorerApiKey || apiKey || "",
  };
}

function buildExplorerSourceUrl(apiURL, address, apiKey) {
  const url = new URL(apiURL);
  url.searchParams.set("module", "contract");
  url.searchParams.set("action", "getsourcecode");
  url.searchParams.set("address", address);
  if (apiKey && apiKey.trim()) {
    url.searchParams.set("apikey", apiKey.trim());
  }
  return url.toString();
}

async function fetchExplorerSource(hre, taskArgs, explorerNetwork, impl) {
  const { apiURL, apiKey } = getExplorerConfig(hre, taskArgs, explorerNetwork);
  if (!apiURL) {
    throw new Error(
      `No block explorer API URL configured for ${explorerNetwork}. Pass --explorer-api-url or add etherscan.customChains config.`,
    );
  }

  console.log(`Fetching old implementation source from block explorer: ${impl} (${explorerNetwork})...`);
  const response = await requestJson(buildExplorerSourceUrl(apiURL, impl, apiKey));
  const result = Array.isArray(response.result) ? response.result[0] : undefined;
  if (!result || typeof result !== "object") {
    throw new Error(`Explorer did not return a contract source record: ${JSON.stringify(response).slice(0, 200)}`);
  }
  if (!result.SourceCode || !result.SourceCode.trim()) {
    throw new Error(`Current implementation ${impl} is not verified on the configured block explorer`);
  }
  if (!result.CompilerVersion) {
    throw new Error(`Explorer source for ${impl} is missing CompilerVersion`);
  }

  return result;
}

function parseStandardJsonInput(sourceCode) {
  let candidate = sourceCode.trim();
  if (candidate.startsWith("{{") && candidate.endsWith("}}")) {
    candidate = candidate.slice(1, -1);
  }
  if (!candidate.startsWith("{")) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(candidate);
    if (parsed.sources) {
      parsed.language = parsed.language || "Solidity";
      return parsed;
    }
  } catch (_) {
    return undefined;
  }

  return undefined;
}

function normalizeExplorerEvmVersion(evmVersion) {
  const value = (evmVersion || "").trim();
  if (!value || value.toLowerCase() === "default") {
    return undefined;
  }
  return value;
}

function parseMaybeJson(value) {
  if (!value || typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return value;
  }
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    return value;
  }
}

function explorerBoolean(value) {
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

function explorerCompilerSettings(sourceRecord) {
  const settings = parseMaybeJson(sourceRecord.CompilerSettings);
  if (settings && typeof settings === "object" && !Array.isArray(settings)) {
    return JSON.parse(JSON.stringify(settings));
  }

  const runs = Number(sourceRecord.OptimizationRuns || sourceRecord.Runs || 200);
  const evmVersion = normalizeExplorerEvmVersion(sourceRecord.EVMVersion);
  const fallback = {
    optimizer: {
      enabled: explorerBoolean(sourceRecord.OptimizationUsed),
      runs: Number.isFinite(runs) ? runs : 200,
    },
  };

  if (evmVersion) {
    fallback.evmVersion = evmVersion;
  }

  return fallback;
}

function explorerAdditionalSources(sourceRecord) {
  const additionalSources = parseMaybeJson(sourceRecord.AdditionalSources);
  return Array.isArray(additionalSources) ? additionalSources : [];
}

function explorerSourceFilename(sourceRecord) {
  return sourceRecord.FileName || sourceRecord.Filename || `${sourceRecord.ContractName || "ExplorerContract"}.sol`;
}

function buildSingleFileSolcInput(sourceRecord) {
  const sourceName = explorerSourceFilename(sourceRecord);
  const sources = {
    [sourceName]: {
      content: sourceRecord.SourceCode,
    },
  };

  for (const additionalSource of explorerAdditionalSources(sourceRecord)) {
    const filename = additionalSource.Filename || additionalSource.FileName || additionalSource.path || additionalSource.name;
    const sourceCode = additionalSource.SourceCode || additionalSource.content;
    if (filename && sourceCode) {
      sources[filename] = { content: sourceCode };
    }
  }

  return {
    language: "Solidity",
    sources,
    settings: explorerCompilerSettings(sourceRecord),
  };
}

function addStorageLayoutOutputSelection(input) {
  input.settings = input.settings || {};
  input.settings.outputSelection = input.settings.outputSelection || {};
  input.settings.outputSelection["*"] = input.settings.outputSelection["*"] || {};
  const outputs = input.settings.outputSelection["*"]["*"] || [];
  input.settings.outputSelection["*"]["*"] = Array.from(new Set([...outputs, "storageLayout", "evm.deployedBytecode"]));
  return input;
}

function explorerSourceToSolcInput(sourceRecord) {
  const standardInput = parseStandardJsonInput(sourceRecord.SourceCode);
  return addStorageLayoutOutputSelection(standardInput || buildSingleFileSolcInput(sourceRecord));
}

function normalizeCompilerVersion(version) {
  const value = (version || "").trim();
  if (!value) {
    return "";
  }
  return value.startsWith("v") ? value : `v${value}`;
}

function isSameCompilerVersion(localVersion, wantedVersion) {
  const wanted = normalizeCompilerVersion(wantedVersion).replace(/^v/, "");
  return wanted && localVersion.startsWith(wanted);
}

async function loadSolcCompiler(compilerVersion) {
  let solc;
  try {
    solc = require("solc");
  } catch (err) {
    throw new Error(`Cannot load solc package: ${err.message}`);
  }

  const wanted = normalizeCompilerVersion(compilerVersion);
  if (!wanted || isSameCompilerVersion(solc.version(), wanted)) {
    return { kind: "solcjs", compiler: solc };
  }

  const cached = findHardhatCachedCompiler(wanted);
  if (cached) {
    console.log(`Using cached Solidity compiler ${cached.longVersion || wanted} from Hardhat cache...`);
    if (cached.kind === "solcjs") {
      const wrapper = require("solc/wrapper");
      return {
        kind: "solcjs",
        compiler: wrapper(require(cached.path)),
      };
    }
    return cached;
  }

  console.log(`Loading Solidity compiler ${wanted} for explorer source...`);
  const compiler = await new Promise((resolve, reject) => {
    solc.loadRemoteVersion(wanted, (err, compiler) => {
      if (err) {
        reject(
          new Error(
            `Cannot load Solidity compiler ${wanted}: ${err.message}. Provide the old build-info with --reference-build-info if the compiler cannot be downloaded.`,
          ),
        );
        return;
      }
      resolve(compiler);
    });
  });
  return { kind: "solcjs", compiler };
}

function hardhatCacheRoots() {
  const roots = [];
  if (process.env.LOCALAPPDATA) {
    roots.push(path.join(process.env.LOCALAPPDATA, "hardhat-nodejs", "Cache"));
  }
  if (process.env.XDG_CACHE_HOME) {
    roots.push(path.join(process.env.XDG_CACHE_HOME, "hardhat-nodejs"));
  }
  if (process.env.HOME || process.env.USERPROFILE) {
    const home = process.env.HOME || process.env.USERPROFILE;
    roots.push(path.join(home, ".cache", "hardhat-nodejs"));
    roots.push(path.join(home, "Library", "Caches", "hardhat-nodejs"));
  }
  return Array.from(new Set(roots));
}

function hardhatCompilerPlatforms() {
  const platform = os.platform();
  if (platform === "win32") {
    return ["windows-amd64", "wasm"];
  }
  if (platform === "darwin") {
    return ["macosx-amd64", "wasm"];
  }
  if (platform === "linux") {
    return ["linux-amd64", "wasm"];
  }
  return ["wasm"];
}

function compilerVersionParts(compilerVersion) {
  const longVersion = normalizeCompilerVersion(compilerVersion).replace(/^v/, "");
  return {
    longVersion,
    shortVersion: longVersion.split("+")[0],
  };
}

function findCompilerBuild(list, compilerVersion) {
  const { longVersion, shortVersion } = compilerVersionParts(compilerVersion);
  return (list.builds || []).find((build) => build.longVersion === longVersion || build.version === shortVersion);
}

function nativeCompilerPath(compilersDir, platform, build) {
  const downloadPath = path.join(compilersDir, platform, build.path);
  if (fs.existsSync(downloadPath) && fs.statSync(downloadPath).isFile() && !downloadPath.endsWith(".zip")) {
    return downloadPath;
  }

  const extractedWindowsPath = path.join(compilersDir, build.version, "solc.exe");
  if (fs.existsSync(extractedWindowsPath) && fs.statSync(extractedWindowsPath).isFile()) {
    return extractedWindowsPath;
  }

  return undefined;
}

function findHardhatCachedCompiler(compilerVersion) {
  const compilerDirs = ["compilers-v3", "compilers-v2", "compilers"];

  for (const root of hardhatCacheRoots()) {
    for (const compilerDirName of compilerDirs) {
      const compilersDir = path.join(root, compilerDirName);
      for (const platform of hardhatCompilerPlatforms()) {
        const listPath = path.join(compilersDir, platform, "list.json");
        if (!fs.existsSync(listPath)) {
          continue;
        }

        const build = findCompilerBuild(readJson(listPath), compilerVersion);
        if (!build) {
          continue;
        }

        if (platform === "wasm") {
          const soljsonPath = path.join(compilersDir, platform, build.path);
          if (fs.existsSync(soljsonPath) && fs.statSync(soljsonPath).isFile()) {
            return {
              kind: "solcjs",
              path: soljsonPath,
              longVersion: build.longVersion,
            };
          }
          continue;
        }

        const executablePath = nativeCompilerPath(compilersDir, platform, build);
        if (executablePath) {
          return {
            kind: "native",
            executablePath,
            longVersion: build.longVersion,
          };
        }
      }
    }
  }

  return undefined;
}

function createSolcImportCallback(root) {
  return (importPath) => {
    const candidates = [
      path.resolve(root, importPath),
      path.resolve(root, "contracts", importPath),
      path.resolve(root, "node_modules", importPath),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return { contents: fs.readFileSync(candidate, "utf8") };
      }
    }

    return { error: `File not found: ${importPath}` };
  };
}

async function compileExplorerSource(hre, sourceRecord) {
  const input = explorerSourceToSolcInput(sourceRecord);
  const compiler = await loadSolcCompiler(sourceRecord.CompilerVersion);
  const output =
    compiler.kind === "native"
      ? await compileWithNativeSolc(compiler.executablePath, input, hre.config.paths.root)
      : JSON.parse(
          compiler.compiler.compile(JSON.stringify(input), {
            import: createSolcImportCallback(hre.config.paths.root),
          }),
        );
  const errors = (output.errors || []).filter((err) => err.severity === "error");
  if (errors.length > 0) {
    throw new Error(errors.map((err) => err.formattedMessage || err.message).join("\n"));
  }
  return output;
}

function compileWithNativeSolc(executablePath, input, root) {
  return new Promise((resolve, reject) => {
    const nodeModules = path.join(root, "node_modules");
    const args = [
      "--standard-json",
      "--base-path",
      root,
      "--include-path",
      nodeModules,
      "--allow-paths",
      `${root},${nodeModules}`,
    ];
    const child = childProcess.spawn(executablePath, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(`solc exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (err) {
        reject(new Error(`solc returned invalid JSON: ${err.message}${stderr ? `\n${stderr}` : ""}`));
      }
    });

    child.stdin.end(JSON.stringify(input));
  });
}

function findExplorerLayoutByDeployedBytecode(output, deployedCode, sourceRecord, impl) {
  const matches = [];

  for (const [sourceName, contracts] of Object.entries(output.contracts || {})) {
    for (const [contractName, contract] of Object.entries(contracts)) {
      const deployedBytecode = contract.evm?.deployedBytecode;
      if (!contract.storageLayout || !deployedBytecode?.object) {
        continue;
      }

      const immutableReferences = deployedBytecode.immutableReferences;
      try {
        const compiledVersion = bytecodeVersion(deployedBytecode.object, immutableReferences);
        const chainVersion = bytecodeVersion(deployedCode, immutableReferences);
        if (compiledVersion === chainVersion) {
          matches.push({
            buildInfoPath: `block-explorer:${impl}`,
            sourceName,
            contractName,
            contract,
          });
        }
      } catch (_) {
        // Skip contracts whose deployed bytecode cannot be normalized, for example unlinked libraries.
      }
    }
  }

  if (matches.length === 0) {
    throw new Error(`Explorer source for ${impl} compiled successfully, but its deployed bytecode does not match chain`);
  }

  return (
    matches.find((match) => match.contractName === sourceRecord.ContractName) ||
    matches.find((match) => match.sourceName.includes(`/${sourceRecord.ContractName}.sol`)) ||
    matches[0]
  );
}

async function getExplorerLayout(hre, taskArgs, explorerNetwork, impl, deployedCode) {
  const sourceRecord = await fetchExplorerSource(hre, taskArgs, explorerNetwork, impl);
  const output = await compileExplorerSource(hre, sourceRecord);
  return findExplorerLayoutByDeployedBytecode(output, deployedCode, sourceRecord, impl);
}

function findLayoutByDeployedBytecode(hre, deployedCode, preferredContractName) {
  const matches = [];

  for (const buildInfoPath of listBuildInfoPaths(hre)) {
    const buildInfo = readJson(buildInfoPath);
    for (const [sourceName, contracts] of Object.entries(buildInfo.output.contracts || {})) {
      for (const [contractName, contract] of Object.entries(contracts)) {
        const deployedBytecode = contract.evm?.deployedBytecode;
        if (!contract.storageLayout || !deployedBytecode?.object) {
          continue;
        }

        const immutableReferences = deployedBytecode.immutableReferences;
        const localVersion = bytecodeVersion(deployedBytecode.object, immutableReferences);
        const chainVersion = bytecodeVersion(deployedCode, immutableReferences);
        if (localVersion === chainVersion) {
          matches.push({ buildInfoPath, sourceName, contractName, contract });
        }
      }
    }
  }

  if (matches.length === 0) {
    return undefined;
  }

  return (
    matches.find((match) => match.contractName === preferredContractName) ||
    matches.find((match) => match.sourceName.includes(`/${preferredContractName}.sol`)) ||
    matches[0]
  );
}

function assertReferenceMatchesImplementation(reference, deployedCode, impl) {
  const deployedBytecode = reference.contract.evm?.deployedBytecode;
  if (!deployedBytecode?.object) {
    throw new Error(
      `Reference ${reference.sourceName}:${reference.contractName} has no deployed bytecode. Use a build-info file from the old implementation compilation.`,
    );
  }

  const immutableReferences = deployedBytecode.immutableReferences;
  const referenceVersion = bytecodeVersion(deployedBytecode.object, immutableReferences);
  const chainVersion = bytecodeVersion(deployedCode, immutableReferences);
  if (referenceVersion !== chainVersion) {
    throw new Error(
      [
        `Reference ${reference.sourceName}:${reference.contractName} does not match current implementation ${impl}.`,
        "This usually means the old artifact/build-info was overwritten by the new code, so the storage check would be inaccurate.",
        "Pass the old implementation build-info with --reference-build-info, or use --unsafe-skip-reference-bytecode-check only after manually confirming the reference layout is correct.",
      ].join("\n"),
    );
  }
}

function readDeployments(network) {
  const deployPath = path.join(__dirname, "../../deployments/deploy.json");
  if (!fs.existsSync(deployPath)) {
    throw new Error("deployments/deploy.json not found");
  }

  const deployments = readJson(deployPath);
  if (!deployments[network]) {
    throw new Error(`No deployments found for ${network}`);
  }
  return deployments[network];
}

function resolveProxyAddress(taskArgs, targetConfig, deploymentNetwork) {
  if (taskArgs.proxy) {
    return taskArgs.proxy;
  }
  if (!targetConfig) {
    throw new Error("Missing --proxy. Either set --target to a known upgrade target or pass --proxy.");
  }
  if (!deploymentNetwork) {
    throw new Error("Missing deployment network. Pass --deployment-network or --fork-network.");
  }

  const deployments = readDeployments(deploymentNetwork);
  for (const key of targetConfig.deploymentKeys) {
    if (deployments[key]) {
      return deployments[key];
    }
  }

  throw new Error(`Cannot find deployment key [${targetConfig.deploymentKeys.join(", ")}] for ${deploymentNetwork}`);
}

async function getErc1967Implementation(hre, proxy) {
  const raw = await hre.ethers.provider.getStorageAt(proxy, IMPLEMENTATION_SLOT);
  const impl = hre.ethers.utils.getAddress(`0x${strip0x(raw).slice(-40)}`);
  if (impl !== hre.ethers.constants.AddressZero) {
    return impl;
  }

  const reader = new hre.ethers.Contract(
    proxy,
    ["function getImplementation() view returns (address)"],
    hre.ethers.provider,
  );
  return reader.getImplementation();
}

async function resolveOldLayout(hre, taskArgs, proxy, contractName, explorerNetwork) {
  if (taskArgs.reference) {
    const reference = findBuildInfoContract(hre, taskArgs.reference, taskArgs.referenceBuildInfo);
    let impl = "not checked";
    if (!taskArgs.unsafeSkipReferenceBytecodeCheck) {
      impl = await getErc1967Implementation(hre, proxy);
      const code = await hre.ethers.provider.getCode(impl);
      if (code === "0x") {
        throw new Error(`Current implementation ${impl} has no code`);
      }
      assertReferenceMatchesImplementation(reference, code, impl);
    }
    return {
      impl,
      info: reference,
      layout: requireStorageLayout(reference, `reference ${taskArgs.reference}`),
    };
  }

  const impl = await getErc1967Implementation(hre, proxy);
  const code = await hre.ethers.provider.getCode(impl);
  if (code === "0x") {
    throw new Error(`Current implementation ${impl} has no code`);
  }

  if (!taskArgs.skipExplorer) {
    try {
      const info = await getExplorerLayout(hre, taskArgs, explorerNetwork, impl, code);
      return {
        impl,
        info,
        layout: requireStorageLayout(info, `current implementation ${impl}`),
      };
    } catch (err) {
      console.log(`Block explorer old-layout lookup failed: ${err.message}`);
      console.log("Falling back to local build-info bytecode matching...");
    }
  }

  const info = findLayoutByDeployedBytecode(hre, code, contractName);
  if (!info) {
    throw new Error(
      `Cannot load old storage layout for current implementation ${impl}. Verify the implementation on the block explorer, pass --explorer-api-url, or provide the old build-info with --reference-build-info.`,
    );
  }

  return {
    impl,
    info,
    layout: requireStorageLayout(info, `current implementation ${impl}`),
  };
}

async function runStorageCheck(hre, taskArgs, proxy, contractRef, explorerNetwork) {
  console.log("Running storage layout check...");
  const newInfo = await getArtifactBuildInfo(hre, contractRef, taskArgs.newBuildInfo);
  const newLayout = requireStorageLayout(newInfo, `new implementation ${contractRef}`);
  const old = await resolveOldLayout(hre, taskArgs, proxy, newInfo.contractName, explorerNetwork);

  const report = getStorageUpgradeReport(
    old.layout,
    newLayout,
    withValidationDefaults({
      unsafeAllowRenames: taskArgs.allowRenames,
      unsafeAllowCustomTypes: taskArgs.unsafeAllowCustomTypes,
    }),
  );

  if (!report.pass) {
    console.log(report.explain());
    throw new Error("Storage layout check failed");
  }

  console.log(
    `Storage layout check passed: ${old.info.sourceName}:${old.info.contractName} -> ${newInfo.sourceName}:${newInfo.contractName}`,
  );
  return { oldInfo: old.info, newInfo, oldImpl: old.impl };
}

function storageCheckNeedsChainState(taskArgs) {
  return !taskArgs.skipStorage && (!taskArgs.reference || !taskArgs.unsafeSkipReferenceBytecodeCheck);
}

function getForkNetwork(taskArgs, deploymentNetwork, hre) {
  return taskArgs.forkNetwork || deploymentNetwork || (hre.network.name !== "hardhat" ? hre.network.name : "");
}

async function resetFork(hre, taskArgs, deploymentNetwork) {
  if (hre.network.name !== "hardhat") {
    throw new Error(
      "Fork simulation must be run on Hardhat Network. Use --network hardhat and pass --fork-network <network>.",
    );
  }

  const forkNetwork = getForkNetwork(taskArgs, deploymentNetwork, hre);
  const forkConfig = forkNetwork ? hre.config.networks[forkNetwork] : undefined;
  const jsonRpcUrl = taskArgs.forkRpcUrl || forkConfig?.url;
  if (!jsonRpcUrl) {
    throw new Error("Missing fork RPC URL. Pass --fork-rpc-url or --fork-network with a configured url.");
  }

  const forking = { jsonRpcUrl };
  if (taskArgs.forkBlock > 0) {
    forking.blockNumber = taskArgs.forkBlock;
  }

  console.log(
    `Resetting hardhat fork from ${taskArgs.forkRpcUrl ? "custom RPC" : forkNetwork}${taskArgs.forkBlock > 0 ? ` at block ${taskArgs.forkBlock}` : ""}...`,
  );
  await hre.network.provider.request({
    method: "hardhat_reset",
    params: [{ forking }],
  });
}

async function hasUpgradeRole(contract) {
  try {
    const role = await contract.UPGRADER_ROLE();
    const count = await contract.getRoleMemberCount(role);
    const members = [];
    for (let i = 0; i < count.toNumber(); i++) {
      members.push(await contract.getRoleMember(role, i));
    }
    return members;
  } catch (_) {
    return [];
  }
}

async function findAccessManagerSender(hre, proxy, fromBlock) {
  const accessManaged = new hre.ethers.Contract(
    proxy,
    ["function authority() view returns (address)"],
    hre.ethers.provider,
  );
  let authority;
  try {
    authority = await accessManaged.authority();
  } catch (_) {
    return undefined;
  }

  if (authority === hre.ethers.constants.AddressZero) {
    return undefined;
  }

  const managerAbi = [
    "function canCall(address caller,address target,bytes4 selector) view returns (bool,uint32)",
    "function getTargetFunctionRole(address target,bytes4 selector) view returns (uint64)",
    "event RoleGranted(uint64 indexed roleId,address indexed account,uint32 delay,uint48 since,bool newMember)",
  ];
  const manager = new hre.ethers.Contract(authority, managerAbi, hre.ethers.provider);
  const roleId = await manager.getTargetFunctionRole(proxy, UPGRADE_TO_AND_CALL_SELECTOR);
  const candidates = new Set();

  for (const signer of await hre.ethers.getSigners()) {
    candidates.add(await signer.getAddress());
  }

  const iface = new hre.ethers.utils.Interface(managerAbi);
  const roleTopic = hre.ethers.utils.defaultAbiCoder.encode(["uint64"], [roleId]);
  try {
    const logs = await hre.ethers.provider.getLogs({
      address: authority,
      fromBlock,
      toBlock: "latest",
      topics: [iface.getEventTopic("RoleGranted"), roleTopic],
    });
    for (const log of logs) {
      candidates.add(iface.parseLog(log).args.account);
    }
  } catch (err) {
    console.log(`Role log scan failed (${err.message}); pass --from to skip auto discovery.`);
  }

  for (const candidate of candidates) {
    const result = await manager.canCall(candidate, proxy, UPGRADE_TO_AND_CALL_SELECTOR);
    const immediate = result[0];
    const delay = result[1];
    const delayValue = delay.toString ? Number(delay.toString()) : Number(delay);
    if (immediate && delayValue === 0) {
      return hre.ethers.utils.getAddress(candidate);
    }
  }

  return undefined;
}

async function resolveUpgradeSender(hre, taskArgs, proxy, contractRef) {
  if (taskArgs.from) {
    return hre.ethers.utils.getAddress(taskArgs.from);
  }

  const contract = await hre.ethers.getContractAt(contractRef, proxy);
  const roleMembers = await hasUpgradeRole(contract);
  if (roleMembers.length > 0) {
    return hre.ethers.utils.getAddress(roleMembers[0]);
  }

  const accessManagerSender = await findAccessManagerSender(hre, proxy, taskArgs.logFromBlock);
  if (accessManagerSender) {
    return accessManagerSender;
  }

  throw new Error(
    "Cannot auto-discover an immediate upgrade sender. Pass --from with the multisig/admin address used for the real upgrade.",
  );
}

async function impersonate(hre, address) {
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [address],
  });
  await hre.network.provider.request({
    method: "hardhat_setBalance",
    params: [address, "0x56BC75E2D63100000"],
  });
  return hre.ethers.getSigner(address);
}

async function deployImplementation(hre, contractRef, signer) {
  const factory = await hre.ethers.getContractFactory(contractRef, signer);
  const impl = await factory.deploy();
  await impl.deployed();
  return impl.address;
}

async function resolveImplementationForSimulation(hre, taskArgs, contractRef, signer) {
  if (taskArgs.impl) {
    const impl = hre.ethers.utils.getAddress(taskArgs.impl);
    const code = await hre.ethers.provider.getCode(impl);
    if (code === "0x") {
      throw new Error(`Implementation ${impl} has no code on the fork`);
    }
    return impl;
  }

  console.log(`Deploying ${contractRef} implementation on fork...`);
  return deployImplementation(hre, contractRef, signer);
}

async function runForkSimulation(hre, taskArgs, proxy, contractRef, upgradeCall) {
  console.log("Running fork upgrade simulation...");
  const snapshot = await hre.network.provider.request({ method: "evm_snapshot", params: [] });

  let sender;
  try {
    const preImpl = await getErc1967Implementation(hre, proxy);
    sender = await resolveUpgradeSender(hre, taskArgs, proxy, contractRef);
    const signer = await impersonate(hre, sender);
    const impl = await resolveImplementationForSimulation(hre, taskArgs, contractRef, signer);
    const proxyContract = await hre.ethers.getContractAt(contractRef, proxy, signer);

    console.log("proxy:", proxy);
    console.log("sender:", sender);
    console.log("pre impl:", preImpl);
    console.log("new impl:", impl);

    if (upgradeCall === "upgradeTo") {
      await (await proxyContract.upgradeTo(impl)).wait();
    } else if (upgradeCall === "upgradeToAndCall") {
      await (await proxyContract.upgradeToAndCall(impl, taskArgs.data)).wait();
    } else {
      throw new Error(`Unsupported upgrade call ${upgradeCall}`);
    }

    const postImpl = await getErc1967Implementation(hre, proxy);
    if (postImpl.toLowerCase() !== impl.toLowerCase()) {
      throw new Error(`Fork upgrade did not update implementation. Expected ${impl}, got ${postImpl}`);
    }

    console.log("Fork upgrade simulation passed.");
  } finally {
    if (sender) {
      await hre.network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: [sender],
      });
    }
    await hre.network.provider.request({ method: "evm_revert", params: [snapshot] });
  }
}

task("upgrade:check", "Pre-upgrade storage layout check and hardhat fork simulation")
  .addOptionalParam(
    "target",
    "Known target: bridge | relay | register | ProtocolFee | DepositWhitelist",
    "",
    types.string,
  )
  .addOptionalParam("contract", "New implementation contract name or source:contract", "", types.string)
  .addOptionalParam(
    "proxy",
    "Proxy address. If omitted, resolved from deployments/deploy.json by target",
    "",
    types.string,
  )
  .addOptionalParam(
    "impl",
    "Already deployed new implementation address. If omitted, the fork simulation deploys it",
    "",
    types.string,
  )
  .addOptionalParam("from", "Upgrade sender to impersonate on the fork", "", types.string)
  .addOptionalParam("forkNetwork", "Configured network name used as the fork source", "", types.string)
  .addOptionalParam("forkRpcUrl", "Custom JSON-RPC URL used as the fork source", "", types.string)
  .addOptionalParam("deploymentNetwork", "Deployment name used to resolve proxy addresses", "", types.string)
  .addOptionalParam("forkBlock", "Fork block number. 0 means latest", 0, types.int)
  .addOptionalParam("logFromBlock", "Start block when scanning AccessManager RoleGranted logs", 0, types.int)
  .addOptionalParam(
    "reference",
    "Reference old contract name or source:contract. Overrides bytecode matching",
    "",
    types.string,
  )
  .addOptionalParam("referenceBuildInfo", "Build-info file containing the reference old contract", "", types.string)
  .addOptionalParam("newBuildInfo", "Build-info file containing the new contract", "", types.string)
  .addOptionalParam("explorerApiUrl", "Block explorer API URL used to fetch the old implementation source", "", types.string)
  .addOptionalParam("explorerApiKey", "Block explorer API key override", "", types.string)
  .addOptionalParam("upgradeCall", "upgradeToAndCall or upgradeTo", "", types.string)
  .addOptionalParam("data", "Calldata for upgradeToAndCall", "0x", types.string)
  .addFlag("skipStorage", "Skip the static storage layout check")
  .addFlag("skipFork", "Skip upgrade simulation; storage check may still reset a fork")
  .addFlag("skipExplorer", "Skip block explorer source lookup and only use local build-info matching")
  .addFlag("allowRenames", "Allow storage variable renames in the static check")
  .addFlag("unsafeAllowCustomTypes", "Allow custom type changes that OpenZeppelin cannot fully validate")
  .addFlag("unsafeSkipReferenceBytecodeCheck", "Do not require --reference bytecode to match current implementation")
  .setAction(async (taskArgs, hre) => {
    if (!taskArgs.skipStorage) {
      await hre.run("compile");
    }

    const targetConfig = getTargetConfig(taskArgs.target);
    const contractRef = taskArgs.contract || targetConfig?.contract;
    if (!contractRef) {
      throw new Error("Missing --contract. Either set --target to a known upgrade target or pass --contract.");
    }

    const deploymentNetwork =
      taskArgs.deploymentNetwork || taskArgs.forkNetwork || (hre.network.name !== "hardhat" ? hre.network.name : "");
    const proxy = hre.ethers.utils.getAddress(resolveProxyAddress(taskArgs, targetConfig, deploymentNetwork));
    const upgradeCall = taskArgs.upgradeCall || targetConfig?.upgradeCall || "upgradeToAndCall";

    if (!taskArgs.skipFork || (storageCheckNeedsChainState(taskArgs) && hre.network.name === "hardhat")) {
      await resetFork(hre, taskArgs, deploymentNetwork);
    }

    if (!taskArgs.skipStorage) {
      await runStorageCheck(hre, taskArgs, proxy, contractRef, deploymentNetwork);
    }

    if (!taskArgs.skipFork) {
      await runForkSimulation(hre, taskArgs, proxy, contractRef, upgradeCall);
    }

    console.log("Upgrade pre-check passed.");
  });
