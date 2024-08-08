// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

import "./interface/IVaultTokenV3.sol";
import "./interface/ITokenRegisterV3.sol";
import "@mapprotocol/protocol/contracts/utils/Utils.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";

contract TokenRegisterV3 is ITokenRegisterV3, UUPSUpgradeable, AccessControlEnumerableUpgradeable {
    uint256 constant MAX_RATE_UNI = 1000000;
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    struct FeeRate {
        uint256 lowest;
        uint256 highest;
        uint256 rate; // unit is parts per million
    }

    struct BaseFee {
        uint256 withSwap;
        uint256 noSwap;
    }

    struct Token {
        address tokenAddress;
        address vaultToken;
        mapping(uint256 => FeeRate) toChainFees;
        mapping(uint256 => FeeRate) fromChainFees;
        mapping(uint256 => BaseFee) baseFees;
        mapping(uint256 => bool) bridgeable;
        mapping(uint256 => bool) mintable;
        // chain_id => decimals
        mapping(uint256 => uint8) decimals;
        // chain_id => token
        mapping(uint256 => bytes) mappingList;
    }

    uint256 public immutable selfChainId = block.chainid;

    //Source chain to Relay chain address
    // [chain_id => [source_token => map_token]]
    mapping(uint256 => mapping(bytes => address)) public tokenMappingList;

    mapping(address => Token) public tokenList;

    address private baseFeeReceiver;

    mapping(uint256 => mapping(bytes => uint256)) public whitelistFee;

    modifier checkAddress(address _address) {
        require(_address != address(0), "register: address is zero");
        _;
    }

    event SetBaseFeeReceiver(address _baseFeeReceiver);
    event RegisterToken(address indexed _token, address _vaultToken);
    event MapToken(
        address indexed _token,
        uint256 indexed _fromChain,
        bytes _fromToken,
        uint8 _decimals,
        bool _mintable
    );
    event RegisterTokenChain(address indexed _token, uint256 indexed _toChain, bool _enable);
    event SetBaseFee(address indexed _token, uint256 indexed _toChain, uint256 _withSwap, uint256 _noSwap);
    event SetToChainTokenFee(
        address indexed _token,
        uint256 indexed _toChain,
        uint256 _lowest,
        uint256 _highest,
        uint256 _rate
    );
    event SetFromChainTokenFee(
        address indexed _token,
        uint256 indexed _toChain,
        uint256 _lowest,
        uint256 _highest,
        uint256 _rate
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _defaultAdmin) public initializer checkAddress(_defaultAdmin) {
        __AccessControlEnumerable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, _defaultAdmin);
    }

    function registerToken(
        address _token,
        address _vaultToken,
        bool _mintable
    ) external onlyRole(MANAGER_ROLE) checkAddress(_token) checkAddress(_vaultToken) {
        Token storage token = tokenList[_token];
        address tokenAddress = IVaultTokenV3(_vaultToken).getTokenAddress();
        require(_token == tokenAddress, "register: invalid relay token");

        token.tokenAddress = _token;
        token.vaultToken = _vaultToken;
        token.mappingList[selfChainId] = Utils.toBytes(_token);
        token.decimals[selfChainId] = IERC20MetadataUpgradeable(_token).decimals();
        token.mintable[selfChainId] = _mintable;
        emit RegisterToken(_token, _vaultToken);
    }

    function mapToken(
        address _token,
        uint256 _fromChain,
        bytes memory _fromToken,
        uint8 _decimals,
        bool _mintable
    ) external onlyRole(MANAGER_ROLE) checkAddress(_token) {
        require(!Utils.checkBytes(_fromToken, bytes("")), "register: invalid from token");
        Token storage token = tokenList[_token];
        require(token.tokenAddress != address(0), "register: invalid relay token");
        token.decimals[_fromChain] = _decimals;
        token.mappingList[_fromChain] = _fromToken;
        token.mintable[_fromChain] = _mintable;
        tokenMappingList[_fromChain][_fromToken] = _token;

        emit MapToken(_token, _fromChain, _fromToken, _decimals, _mintable);
    }

    function registerTokenChains(
        address _token,
        uint256[] memory _toChains,
        bool _enable
    ) external onlyRole(MANAGER_ROLE) {
        Token storage token = tokenList[_token];
        require(token.tokenAddress != address(0), "register: invalid relay token");
        for (uint256 i = 0; i < _toChains.length; i++) {
            uint256 toChain = _toChains[i];
            token.bridgeable[toChain] = _enable;
            emit RegisterTokenChain(_token, toChain, _enable);
        }
    }

    function setBaseFeeReceiver(
        address _baseFeeReceiver
    ) external onlyRole(MANAGER_ROLE) checkAddress(_baseFeeReceiver) {
        baseFeeReceiver = _baseFeeReceiver;
        emit SetBaseFeeReceiver(_baseFeeReceiver);
    }

    function setFromChainFee(
        address _token,
        uint256 _fromChain,
        uint256 _lowest,
        uint256 _highest,
        uint256 _rate
    ) external onlyRole(MANAGER_ROLE) checkAddress(_token) {
        Token storage token = tokenList[_token];
        require(token.tokenAddress != address(0), "register: invalid relay token");
        require(_highest >= _lowest, "register: invalid highest and lowest");
        require(_rate <= MAX_RATE_UNI, "register: invalid proportion value");
        token.fromChainFees[_fromChain] = FeeRate(_lowest, _highest, _rate);
        emit SetFromChainTokenFee(_token, _fromChain, _lowest, _highest, _rate);
    }

    function setToChainTokenFee(
        address _token,
        uint256 _toChain,
        uint256 _lowest,
        uint256 _highest,
        uint256 _rate
    ) external onlyRole(MANAGER_ROLE) checkAddress(_token) {
        Token storage token = tokenList[_token];
        require(token.tokenAddress != address(0), "register: invalid relay token");
        require(_highest >= _lowest, "register: invalid highest and lowest");
        require(_rate <= MAX_RATE_UNI, "register: invalid proportion value");

        token.toChainFees[_toChain] = FeeRate(_lowest, _highest, _rate);

        emit SetToChainTokenFee(_token, _toChain, _lowest, _highest, _rate);
    }

    function setBaseFee(
        address _token,
        uint256 _toChain,
        uint256 _withSwap,
        uint256 _noSwap
    ) external onlyRole(MANAGER_ROLE) checkAddress(_token) {
        Token storage token = tokenList[_token];
        require(token.tokenAddress != address(0), "register: invalid relay token");

        token.baseFees[_toChain] = BaseFee(_withSwap, _noSwap);

        emit SetBaseFee(_token, _toChain, _withSwap, _noSwap);
    }

    function setWhitelistCallerFeeRate(
        uint256 _chain,
        bytes calldata _caller,
        uint256 _rate,
        bool _isWhitelist
    ) external onlyRole(MANAGER_ROLE) {
        require(_rate <= MAX_RATE_UNI, "register: invalid proportion value");
        if (_isWhitelist) {
            whitelistFee[_chain][_caller] = (_rate << 1) | 0x01;
        } else {
            whitelistFee[_chain][_caller] = 0;
        }
    }

    // --------------------------------------------------------

    function getToChainToken(
        address _token,
        uint256 _toChain
    ) external view override returns (bytes memory _toChainToken) {
        return _getToChainToken(_token, _toChain);
    }

    function getToChainAmount(
        address _token,
        uint256 _amount,
        uint256 _toChain
    ) external view override returns (uint256) {
        return _getTargetAmount(_token, selfChainId, _toChain, _amount);
    }

    function getRelayChainToken(
        uint256 _fromChain,
        bytes memory _fromToken
    ) external view override returns (address token) {
        return _getRelayChainToken(_fromChain, _fromToken);
    }

    function getRelayChainAmount(
        address _token,
        uint256 _fromChain,
        uint256 _amount
    ) external view override returns (uint256) {
        return _getTargetAmount(_token, _fromChain, selfChainId, _amount);
    }

    function getTargetToken(
        uint256 _fromChain,
        uint256 _toChain,
        bytes memory _fromToken
    ) external view returns (bytes memory toToken, uint8 decimals, bool mintable) {
        address tokenAddr = _getRelayChainToken(_fromChain, _fromToken);

        Token storage token = tokenList[tokenAddr];
        require(token.tokenAddress != address(0), "register: invalid relay token");

        toToken = token.mappingList[_toChain];
        decimals = token.decimals[_toChain];
        mintable = token.mintable[_toChain];
    }

    function getTargetAmount(
        uint256 _fromChain,
        uint256 _toChain,
        bytes memory _fromToken,
        uint256 _amount
    ) external view returns (uint256 toAmount) {
        address tokenAddr = _getRelayChainToken(_fromChain, _fromToken);

        toAmount = _getTargetAmount(tokenAddr, _fromChain, _toChain, _amount);
    }

    function checkMintable(address _token) external view override returns (bool) {
        Token storage token = tokenList[_token];
        require(token.tokenAddress != address(0), "register: invalid relay token");

        return token.mintable[selfChainId];
    }

    function getVaultToken(address _token) external view override returns (address) {
        Token storage token = tokenList[_token];
        require(token.tokenAddress != address(0), "register: invalid relay token");

        return tokenList[_token].vaultToken;
    }

    function getBaseFeeReceiver() external view returns (address) {
        return baseFeeReceiver;
    }

    function getTargetFeeInfo(
        address _token,
        uint256 _chain
    )
        external
        view
        returns (
            bool bridgeable,
            BaseFee memory baseFee,
            FeeRate memory toChainFeeRate,
            FeeRate memory fromChainFeeRate
        )
    {
        Token storage token = tokenList[_token];
        require(token.tokenAddress != address(0), "register: invalid relay token");

        bridgeable = token.bridgeable[_chain];
        toChainFeeRate = token.toChainFees[_chain];
        fromChainFeeRate = token.fromChainFees[_chain];
        baseFee = token.baseFees[_chain];
    }

    // get bridge fee info based on the relay chain token and amount
    function getTransferFeeV2(
        address _token,
        uint256 _amount,
        uint256 _fromChain,
        uint256 _toChain,
        bool _withSwap
    ) external view override returns (uint256 totalFee, uint256 baseFee, uint256 proportionFee) {
        return _getTransferFee(bytes(""), _token, _amount, _fromChain, _toChain, _withSwap);
    }

    function getTransferFeeV3(
        bytes memory _caller,
        address _token,
        uint256 _amount,
        uint256 _fromChain,
        uint256 _toChain,
        bool _withSwap
    ) external view override returns (uint256 totalFee, uint256 baseFee, uint256 bridgeFee) {
        return _getTransferFee(_caller, _token, _amount, _fromChain, _toChain, _withSwap);
    }

    function _getTransferFee(
        bytes memory _caller,
        address _relayToken,
        uint256 _relayAmount,
        uint256 _fromChain,
        uint256 _toChain,
        bool _withSwap
    ) internal view returns (uint256 totalFee, uint256 baseFee, uint256 proportionFee) {
        Token storage token = tokenList[_relayToken];
        require(token.tokenAddress != address(0), "register: invalid relay token");

        uint256 rate;
        bool isWhitelistCaller;
        (isWhitelistCaller, rate) = getWhitelistCallerFeeRate(_fromChain, _caller);

        if (isWhitelistCaller) {
            proportionFee = (_relayAmount * rate) / MAX_RATE_UNI;
        } else {
            FeeRate memory toChainFeeRate = token.toChainFees[_toChain];
            uint256 toChainFee = _getFee(toChainFeeRate, _relayAmount);
            FeeRate memory fromChainFeeRate = token.fromChainFees[_fromChain];
            uint256 fromChainFee = _getFee(fromChainFeeRate, _relayAmount);
            proportionFee = toChainFee + fromChainFee;
        }

        BaseFee memory baseFeeInfo = token.baseFees[_toChain];
        if (baseFeeReceiver != address(0)) {
            baseFee = _withSwap ? baseFeeInfo.withSwap : baseFeeInfo.noSwap;
        }
        totalFee = baseFee + proportionFee;
    }

    function _getFee(FeeRate memory _feeRate, uint256 _amount) internal pure returns (uint256) {
        uint256 fee = (_amount * (_feeRate.rate)) / MAX_RATE_UNI;
        if (fee > _feeRate.highest) {
            return _feeRate.highest;
        } else if (fee < _feeRate.lowest) {
            return _feeRate.lowest;
        }
        return fee;
    }

    function getBridgeFeeInfo(
        uint256 _fromChain,
        bytes memory _fromToken,
        uint256 _fromAmount,
        uint256 _toChain,
        bool _withSwap
    ) external view override returns (uint256 fromChainFee, uint256 toChainAmount, uint256 toChainVault) {
        address relayToken;
        uint256 feeAmount;
        uint256 relayAmount;

        relayToken = _getRelayChainToken(_fromChain, _fromToken);
        relayAmount = _getTargetAmount(relayToken, _fromChain, selfChainId, _fromAmount);

        (feeAmount, , ) = _getTransferFee(bytes(""), relayToken, relayAmount, _fromChain, _toChain, _withSwap);

        fromChainFee = _getTargetAmount(relayToken, selfChainId, _fromChain, feeAmount);

        if (relayAmount >= feeAmount) {
            toChainAmount = _getTargetAmount(relayToken, selfChainId, _toChain, relayAmount - feeAmount);
        }

        Token storage token = tokenList[relayToken];
        if (token.mintable[_toChain]) {
            toChainVault = type(uint256).max;
        } else {
            int256 vaultBalance = getVaultBalance(relayToken, _toChain);
            toChainVault = uint256(vaultBalance);
        }
    }

    function getBridgeFeeInfoV3(
        bytes memory _caller,
        bytes memory _fromToken,
        uint256 _fromChain,
        uint256 _fromAmount,
        uint256 _toChain,
        bool _withSwap
    ) external view override returns (uint256 fromChainFee, uint256 toChainAmount, uint256 toChainVault) {
        address relayToken;
        uint256 feeAmount;
        uint256 relayAmount;

        relayToken = _getRelayChainToken(_fromChain, _fromToken);
        relayAmount = _getTargetAmount(relayToken, _fromChain, selfChainId, _fromAmount);

        (feeAmount, , ) = _getTransferFee(_caller, relayToken, relayAmount, _fromChain, _toChain, _withSwap);

        fromChainFee = _getTargetAmount(relayToken, selfChainId, _fromChain, feeAmount);

        if (relayAmount >= feeAmount) {
            toChainAmount = _getTargetAmount(relayToken, selfChainId, _toChain, relayAmount - feeAmount);
        }

        Token storage token = tokenList[relayToken];
        if (token.mintable[_toChain]) {
            toChainVault = type(uint256).max;
        } else {
            int256 vaultBalance = getVaultBalance(relayToken, _toChain);
            toChainVault = uint256(vaultBalance);
        }
    }

    // get source chain token amount and the fee amount based the target chain token amount
    function getSourceFeeByTargetV3(
        bytes memory _caller,
        bytes memory _targetToken,
        uint256 _targetChain,
        uint256 _targetAmount,
        uint256 _fromChain,
        bool _withSwap
    )
        external
        view
        returns (uint256 fromChainFee, uint256 fromChainAmount, uint256 targetChainVault, bytes memory fromChainToken)
    {
        address relayToken = _getRelayChainToken(_targetChain, _targetToken);

        fromChainToken = _getToChainToken(relayToken, _fromChain);

        uint256 relayOutAmount = _getTargetAmount(relayToken, _targetChain, selfChainId, _targetAmount);
        uint256 relayAmount = _getAmountBeforeFee(_caller, relayToken, relayOutAmount, _targetChain, _fromChain, _withSwap);
        fromChainFee = _getTargetAmount(relayToken, selfChainId, _fromChain, (relayAmount - relayOutAmount));
        fromChainAmount = _getTargetAmount(relayToken, selfChainId, _fromChain, relayAmount);

        Token storage token = tokenList[relayToken];
        if (token.mintable[_targetChain]) {
            targetChainVault = type(uint256).max;
        } else {
            int256 vaultBalance = getVaultBalance(relayToken, _targetChain);
            targetChainVault = uint256(vaultBalance);
        }
    }

    function _getAmountBeforeFee(
        bytes memory _caller,
        address _token,
        uint256 _amount,
        uint256 _toChain,
        uint256 _fromChain,
        bool _withSwap
    ) internal view returns (uint256) {
        BaseFee memory baseFees = tokenList[_token].baseFees[_toChain];
        _withSwap ? _amount += baseFees.withSwap : _amount += baseFees.noSwap;

        uint256 rate;
        bool isWhitelistCaller;
        uint256 beforeFee;
        (isWhitelistCaller, rate) = getWhitelistCallerFeeRate(_fromChain, _caller);
        if (isWhitelistCaller) {
            beforeFee = _getBeforeAmount(rate, _amount);
        } else {
            FeeRate memory tochainFeeRate = tokenList[_token].toChainFees[_toChain];
            FeeRate memory fromChainFeeRate = tokenList[_token].fromChainFees[_fromChain];
            uint256 max = tochainFeeRate.highest + fromChainFeeRate.highest;
            uint256 min = tochainFeeRate.lowest + fromChainFeeRate.lowest;
            rate = fromChainFeeRate.rate + tochainFeeRate.rate;
            beforeFee = _getBeforeAmount(rate, _amount);
            if (beforeFee < min) return min;
            if (beforeFee > max) return max;
        }
        return beforeFee;
    }

    function _getBeforeAmount(uint256 rate, uint256 _amount) internal pure returns (uint256) {
        return (_amount * MAX_RATE_UNI) / (MAX_RATE_UNI - rate) + 1;
    }

    function getWhitelistCallerFeeRate(
        uint256 _chain,
        bytes memory _caller
    ) public view returns (bool isWhitelist, uint256 rate) {
        uint256 whitelistRate = whitelistFee[_chain][_caller];
        isWhitelist = (whitelistRate != 0);
        rate = whitelistRate >> 1;
    }

    function getVaultBalance(address _token, uint256 _chainId) public view returns (int256 _vaultBalance) {
        address vault = this.getVaultToken(_token);
        (bool result, bytes memory data) = vault.staticcall(abi.encodeWithSignature("vaultBalance(uint256)", _chainId));
        if (result && data.length > 0) {
            _vaultBalance = abi.decode(data, (int256));
            if (_vaultBalance > 0) {
                uint256 tem = this.getToChainAmount(_token, uint256(_vaultBalance), _chainId);
                require(tem <= uint256(type(int256).max), "register: value doesn't fit in an int256");
                _vaultBalance = int256(tem);
            } else {
                _vaultBalance = 0;
            }
        } else {
            _vaultBalance = 0;
        }
    }

    // -----------------------------------------------------

    function _getRelayChainToken(uint256 _fromChain, bytes memory _fromToken) internal view returns (address token) {
        if (_fromChain == selfChainId) {
            token = Utils.fromBytes(_fromToken);
        } else {
            token = tokenMappingList[_fromChain][_fromToken];
        }
        require(token != address(0), "register: token not registered");
    }

    function _getToChainToken(address _token, uint256 _toChain) internal view returns (bytes memory token) {
        if (_toChain == selfChainId) {
            token = Utils.toBytes(_token);
        } else {
            token = tokenList[_token].mappingList[_toChain];
        }
    }

    function _getTargetAmount(
        address _token,
        uint256 _fromChain,
        uint256 _toChain,
        uint256 _amount
    ) internal view returns (uint256) {
        if (_toChain == _fromChain) {
            return _amount;
        }
        Token storage token = tokenList[_token];
        require(token.tokenAddress != address(0), "register: invalid relay token");

        uint256 decimalsFrom = token.decimals[_fromChain];
        require(decimalsFrom > 0, "register: token decimals not register");

        uint256 decimalsTo = token.decimals[_toChain];
        require(decimalsTo > 0, "register: from token decimals not register");

        if (decimalsFrom == decimalsTo) {
            return _amount;
        }
        return (_amount * (10 ** decimalsTo)) / (10 ** decimalsFrom);
    }

    /** UUPS *********************************************************/
    function _authorizeUpgrade(address) internal view override {
        require(hasRole(UPGRADER_ROLE, msg.sender), "register: only upgrader can upgrade");
    }

    function getImplementation() external view returns (address) {
        return _getImplementation();
    }
}
