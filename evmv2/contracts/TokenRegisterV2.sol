// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@mapprotocol/protocol/contracts/utils/Utils.sol";
import "./interface/ITokenRegisterV2.sol";
import "./interface/IVaultTokenV2.sol";

contract TokenRegisterV2 is ITokenRegisterV2, Initializable, UUPSUpgradeable {
    using SafeMath for uint256;

    uint256 constant MAX_RATE_UNI = 1000000;

    struct StepFee {
        uint256 start;
        uint256 rate; // unit is parts per million
    }

    struct FeeRate {
        uint256 lowest;
        uint256 highest;
        uint256 defaultRate; // unit is parts per million
        StepFee[] stepFees;
    }

    struct Token {
        bool mintable;
        uint8 decimals;
        address vaultToken;
        // toChain => fee
        mapping(uint256 => FeeRate) toChainFees;
        // fromChain => fee
        mapping(uint256 => FeeRate) fromChainFees;
        // chain_id => decimals
        mapping(uint256 => uint8) tokenDecimals;
        // chain_id => token
        mapping(uint256 => bytes) mappingTokens;
    }

    uint256 public immutable selfChainId = block.chainid;

    //Source chain to Relay chain address
    // [chain_id => [source_token => map_token]]
    mapping(uint256 => mapping(bytes => address)) public tokenMappingList;

    mapping(address => Token) public tokenList;

    // //from chainId => [relay token => fee]
    // mapping(uint256 => mapping(address => TransferOutFeeRate)) public transferOutFee;

    modifier checkAddress(address _address) {
        require(_address != address(0), "address is zero");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == _getAdmin(), "register only owner");
        _;
    }

    event RegisterToken(address _token, address _vaultToken, bool _mintable);
    event UpdateStepFee(address _token, uint256 _toChain,StepFee[] _stepFees);
    event SetTokenFee(address _token, uint256 _toChain, uint256 _lowest, uint256 _highest, uint256 _defaultRate);
    event SetTransferOutTokenFee(address _token, uint256 _toChain, uint256 _lowest, uint256 _highest, uint256 _rate);

    function initialize(address _owner) public initializer checkAddress(_owner) {
        _changeAdmin(_owner);
    }

    function registerToken(
        address _token,
        address _vaultToken,
        bool _mintable
    ) external onlyOwner checkAddress(_token) checkAddress(_vaultToken) {
        Token storage token = tokenList[_token];
        address tokenAddress = IVaultTokenV2(_vaultToken).getTokenAddress();
        require(_token == tokenAddress, "invalid vault token");

        token.vaultToken = _vaultToken;
        token.decimals = IERC20Metadata(_token).decimals();
        token.mintable = _mintable;
        emit RegisterToken(_token, _vaultToken, _mintable);
    }

    function mapToken(
        address _token,
        uint256 _fromChain,
        bytes memory _fromToken,
        uint8 _decimals,
        bool _enableBridge
    ) external onlyOwner checkAddress(_token) {
        require(!Utils.checkBytes(_fromToken, bytes("")), "invalid from token");
        Token storage token = tokenList[_token];
        require(token.vaultToken != address(0), "invalid map token");
        token.tokenDecimals[_fromChain] = _decimals;
        if (_enableBridge) token.mappingTokens[_fromChain] = _fromToken;
        else token.mappingTokens[_fromChain] = bytes("");
        tokenMappingList[_fromChain][_fromToken] = _token;
    }

    function setFromChainTokenFee(
        address _token,
        uint256 _fromChain,
        uint256 _lowest,
        uint256 _highest,
        uint256 _defaultRate
    ) external onlyOwner checkAddress(_token) {
        Token storage token = tokenList[_token];
        require(token.vaultToken != address(0), "invalid map token");
        require(_highest >= _lowest, "invalid highest and lowest");
        require(_defaultRate <= MAX_RATE_UNI, "invalid proportion value");
        FeeRate storage feeRate = token.fromChainFees[_fromChain];
        feeRate.defaultRate = _defaultRate;
        feeRate.lowest = _lowest;
        feeRate.highest = _highest;
        emit SetTransferOutTokenFee(_token, _fromChain, _lowest, _highest, _defaultRate);
    }

    function setTokenFee(
        address _token,
        uint256 _toChain,
        uint256 _lowest,
        uint256 _highest,
        uint256 _defaultRate
    ) external onlyOwner checkAddress(_token) {
        Token storage token = tokenList[_token];
        require(token.vaultToken != address(0), "invalid map token");
        require(_highest >= _lowest, "invalid highest and lowest");
        require(_defaultRate <= MAX_RATE_UNI, "invalid proportion value");
        FeeRate storage feeRate = token.toChainFees[_toChain];
        feeRate.defaultRate = _defaultRate;
        feeRate.lowest = _lowest;
        feeRate.highest = _highest;
        emit SetTokenFee(_token, _toChain, _lowest, _highest, _defaultRate);
    }

    function updateStepFee(
        address _token,
        uint256 _chain,
        bool isFrom,
        StepFee[] memory _stepFees
    ) external onlyOwner checkAddress(_token) {
        uint256 len = _stepFees.length;
        Token storage token = tokenList[_token];
        require(token.vaultToken != address(0), "invalid map token");
        FeeRate storage feeRate = isFrom ? token.fromChainFees[_chain] : token.toChainFees[_chain];
        delete feeRate.stepFees;
        uint256 start;
        for (uint i = 0; i < len; i++) {
            if(i == 0) {
                _stepFees[i].start = 0;
            } else {
                require(_stepFees[i].start > start,"start must > pre start"); 
            }
            require(_stepFees[i].rate <= MAX_RATE_UNI, "invalid proportion value");
            start = _stepFees[i].start;
            feeRate.stepFees.push(_stepFees[i]);
        }
        emit UpdateStepFee(_token,_chain,_stepFees);
    }

    // --------------------------------------------------------

    function getToChainToken(
        address _token,
        uint256 _toChain
    ) external view override returns (bytes memory _toChainToken) {
        if (_toChain == selfChainId) {
            _toChainToken = Utils.toBytes(_token);
        } else {
            _toChainToken = tokenList[_token].mappingTokens[_toChain];
        }
    }

    function getToChainAmount(
        address _token,
        uint256 _amount,
        uint256 _toChain
    ) external view override returns (uint256) {
        if (_toChain == selfChainId) {
            return _amount;
        }
        uint256 decimalsFrom = tokenList[_token].decimals;

        require(decimalsFrom > 0, "from token decimals not register");

        uint256 decimalsTo = tokenList[_token].tokenDecimals[_toChain];

        require(decimalsTo > 0, "from token decimals not register");

        if (decimalsFrom == decimalsTo) {
            return _amount;
        }
        return _amount.mul(10 ** decimalsTo).div(10 ** decimalsFrom);
    }

    function getRelayChainToken(
        uint256 _fromChain,
        bytes memory _fromToken
    ) external view override returns (address token) {
        if (_fromChain == selfChainId) {
            token = Utils.fromBytes(_fromToken);
        } else {
            token = tokenMappingList[_fromChain][_fromToken];
        }
    }

    function getRelayChainAmount(
        address _token,
        uint256 _fromChain,
        uint256 _amount
    ) external view override returns (uint256) {
        if (_fromChain == selfChainId) {
            return _amount;
        }
        uint256 decimalsFrom = tokenList[_token].tokenDecimals[_fromChain];
        uint256 decimalsTo = tokenList[_token].decimals;
        if (decimalsFrom == decimalsTo) {
            return _amount;
        }
        return _amount.mul(10 ** decimalsTo).div(10 ** decimalsFrom);
    }

    function checkMintable(address _token) external view override returns (bool) {
        return tokenList[_token].mintable;
    }

    function getVaultToken(address _token) external view override returns (address) {
        return tokenList[_token].vaultToken;
    }

    function getTokenFee(address _token, uint256 _amount, uint256 _toChain) external view override returns (uint256) {
        FeeRate memory feeRate = tokenList[_token].toChainFees[_toChain];
        return _getFee(feeRate, _amount);
    }

    function getTransferFee(
        address _token,
        uint256 _amount,
        uint256 _fromChain,
        uint256 _toChain
    ) external view override returns (uint256) {
        FeeRate memory toChainFeeRate = tokenList[_token].toChainFees[_toChain];
        uint256 fee = _getFee(toChainFeeRate, _amount);
        FeeRate memory fromChainFeeRate = tokenList[_token].fromChainFees[_fromChain];
        uint256 fromChainFee = _getFee(fromChainFeeRate, _amount);
        return fee > fromChainFee ? fee : fromChainFee;
    }

   function _getFee(FeeRate memory _feeRate,uint256 _amount) internal pure returns (uint256) {
        uint256 feeRate = _getFeeRate(_feeRate,_amount);
        uint256 fee = _amount.mul(feeRate).div(MAX_RATE_UNI);
        if (fee > _feeRate.highest) {
            return _feeRate.highest;
        } else if (fee < _feeRate.lowest) {
            return _feeRate.lowest;
        }
        return fee;
   }

   function _getFeeRate(FeeRate memory _feeRate,uint256 _amount) internal pure returns (uint256) {
        StepFee[] memory steps = _feeRate.stepFees;
        uint256 len = steps.length;
        if(len == 0) return _feeRate.defaultRate;
        uint256 rate;
        for (uint i = 0; i < len; i++) {
            rate = steps[i].rate;
            if(steps[i].start > _amount) break;
        }
        return rate;
   }

    function getTargetTokenInfo(
        address _token,
        uint256 _chain
    )
        external
        view
        returns (bytes memory targetToken, uint8 decimals, FeeRate memory toChainFee, FeeRate memory fromChainFee)
    {
        if (_chain == selfChainId) {
            targetToken = Utils.toBytes(_token);
            decimals = tokenList[_token].decimals;
        } else {
            targetToken = tokenList[_token].mappingTokens[_chain];
            decimals = tokenList[_token].tokenDecimals[_chain];
        }

        toChainFee = tokenList[_token].toChainFees[_chain];
        fromChainFee = tokenList[_token].fromChainFees[_chain];
    }

    function getToChainTokenInfo(
        address _token,
        uint256 _toChain
    ) external view returns (bytes memory toChainToken, uint8 decimals, FeeRate memory feeRate) {
        if (_toChain == selfChainId) {
            toChainToken = Utils.toBytes(_token);
            decimals = tokenList[_token].decimals;
        } else {
            toChainToken = tokenList[_token].mappingTokens[_toChain];
            decimals = tokenList[_token].tokenDecimals[_toChain];
        }

        feeRate = tokenList[_token].toChainFees[_toChain];
    }

    function getFeeAmountAndInfo(
        uint256 _fromChain,
        bytes memory _fromToken,
        uint256 _fromAmount,
        uint256 _toChain
    )
        external
        view
        returns (
            uint256 _feeAmount,
            FeeRate memory _feeRate,
            address _relayToken,
            uint8 _relayTokenDecimals,
            bytes memory _toToken,
            uint8 _toTokenDecimals
        )
    {
        (_relayToken, , _feeAmount) = this.getRelayFee(_fromChain, _fromToken, _fromAmount, _toChain);
        (_toToken, _toTokenDecimals, _feeRate) = this.getToChainTokenInfo(_relayToken, _toChain);

        _relayTokenDecimals = tokenList[_relayToken].decimals;
    }

    function getFeeAmountAndVaultBalance(
        uint256 _srcChain,
        bytes memory _srcToken,
        uint256 _srcAmount,
        uint256 _targetChain
    )
        external
        view
        returns (uint256 _srcFeeAmount, uint256 _relayChainAmount, int256 _vaultBalance, bytes memory _toChainToken)
    {
        address relayToken;
        uint256 feeAmount;

        (relayToken, _relayChainAmount, feeAmount) = this.getRelayFee(_srcChain, _srcToken, _srcAmount, _targetChain);
        _srcFeeAmount = this.getToChainAmount(relayToken, feeAmount, _srcChain);

        _vaultBalance = getVaultBalance(relayToken, _targetChain);

        _toChainToken = this.getToChainToken(relayToken, _targetChain);
    }

    // get source chain token amount and the fee amount based the target chain token amount
    function getSrcAmountAndFee(
        uint256 _targetChain,
        bytes memory _targetToken,
        uint256 _targetAmount,
        uint256 _srcChain
    )
        external
        view
        returns (uint256 _srcFeeAmount, uint256 _srcChainAmount, int256 _vaultBalance, bytes memory _srcChainToken)
    {
        address relayToken = this.getRelayChainToken(_targetChain, _targetToken);
        // TODO: require relay token?
        uint256 relayChainAmount = this.getRelayChainAmount(relayToken, _targetChain, _targetAmount);
        uint256 amountBeforeFee = _getAmountBeforeFee(relayToken, relayChainAmount, _targetChain, _srcChain);
        _srcFeeAmount = this.getToChainAmount(relayToken, amountBeforeFee.sub(relayChainAmount), _srcChain);
        _srcChainAmount = this.getToChainAmount(relayToken, amountBeforeFee, _srcChain);
        _srcChainToken = this.getToChainToken(relayToken, _srcChain);
        // TODO: require source token?
        _vaultBalance = getVaultBalance(relayToken, _targetAmount);
    }

    function _getAmountBeforeFee(
        address _token,
        uint256 _amount,
        uint256 _toChain,
        uint256 _fromChain
    ) internal view returns (uint256) {
        FeeRate memory toChainFee = tokenList[_token].toChainFees[_toChain];
        FeeRate memory fromChainFee = tokenList[_token].fromChainFees[_fromChain];
        uint256 toChainFeeAmount = _getBeforeAmount(toChainFee, _amount);
        uint256 fromChainFeeAmount = _getBeforeAmount(fromChainFee, _amount);
        return toChainFeeAmount > fromChainFeeAmount ? toChainFeeAmount : fromChainFeeAmount;
    }

    function _getBeforeAmount(FeeRate memory feeRate, uint256 _amount) internal pure returns (uint256) {
        uint256 outAmount = _amount.mul(MAX_RATE_UNI).div(MAX_RATE_UNI.sub(feeRate.defaultRate));
        if (outAmount > _amount.add(feeRate.highest)) {
            outAmount = _amount.add(feeRate.highest);
        } else if (outAmount < _amount.add(feeRate.lowest)) {
            outAmount = _amount.add(feeRate.lowest);
        }
        return outAmount;
    }

    function getVaultBalance(address _token, uint256 _chainId) public view returns (int256 _vaultBalance) {
        address vault = this.getVaultToken(_token);
        (bool result, bytes memory data) = vault.staticcall(abi.encodeWithSignature("vaultBalance(uint256)", _chainId));
        if (result && data.length > 0) {
            _vaultBalance = abi.decode(data, (int256));
            if (_vaultBalance > 0) {
                uint256 tem = this.getToChainAmount(_token, uint256(_vaultBalance), _chainId);
                require(tem <= uint256(type(int256).max), "value doesn't fit in an int256");
                _vaultBalance = int256(tem);
            } else {
                _vaultBalance = 0;
            }
        } else {
            _vaultBalance = 0;
        }
    }

    // -----------------------------------------------------

    function getRelayFee(
        uint256 _fromChain,
        bytes memory _fromToken,
        uint256 _fromAmount,
        uint256 _toChain
    ) external view returns (address _relayToken, uint256 _relayChainAmount, uint256 _feeAmount) {
        _relayToken = this.getRelayChainToken(_fromChain, _fromToken);

        _relayChainAmount = this.getRelayChainAmount(_relayToken, _fromChain, _fromAmount);

        _feeAmount = this.getTransferFee(_relayToken, _relayChainAmount, _fromChain, _toChain);
    }

    /** UUPS *********************************************************/
    function _authorizeUpgrade(address) internal view override {
        require(msg.sender == _getAdmin(), "TokenRegister: only Admin can upgrade");
    }

    function changeAdmin(address _admin) external onlyOwner checkAddress(_admin) {
        _changeAdmin(_admin);
    }

    function getAdmin() external view returns (address) {
        return _getAdmin();
    }

    function getImplementation() external view returns (address) {
        return _getImplementation();
    }
}
