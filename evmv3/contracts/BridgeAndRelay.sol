// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

import "./interface/IVaultTokenV3.sol";
import "./abstract/BridgeAbstract.sol";
import "./interface/IMintableToken.sol";
import "./interface/ITokenRegisterV3.sol";
import "./lib/EvmDecoder.sol";
import "./lib/NearDecoder.sol";
import { DepositOutEvent, SwapOutEvent } from "./lib/Types.sol";
import "@mapprotocol/protocol/contracts/lib/LogDecode.sol";
import "@mapprotocol/protocol/contracts/interface/ILightVerifier.sol";
import "@mapprotocol/protocol/contracts/interface/ILightClientManager.sol";

contract BridgeAndRelay is BridgeAbstract {
    struct Rate {
        address receiver;
        uint256 rate;
    }
    enum ChainType {
        NULL,
        EVM,
        NEAR,
        TON,
        SOLANA
    }

    ITokenRegisterV3 public tokenRegister;
    ILightClientManager public lightClientManager;

    mapping(uint256 => bytes) public mosContracts;
    mapping(uint256 => ChainType) public chainTypes;
    //id : 0 VToken  1:relayer
    mapping(uint256 => Rate) public distributeRate;
    
    error invalid_chain_id();
    error unknow_log();
    error invalid_mos_contract();
    error chain_type_error();
    error invalid_rate_id();
    error vault_token_not_registered();
    error invalid_vault_token();
    error length_mismatching();
    error invalid_rate_value();
    error out_token_not_registered();
    
    event SetLightClientManager(address lightClient);
    event SetTokenRegister(address tokenRegister);
    event RegisterChain(uint256 chainId, bytes bridge, ChainType chainType);
    event SetDistributeRate(uint256 id, address to, uint256 rate);
    event CollectFee(
        bytes32 indexed orderId,
        address indexed token,
        uint256 baseFee,
        uint256 bridgeFee,
        uint256 messageFee,
        uint256 vaultFee,
        uint256 protocolFee
    );
    event DepositIn(
        uint256 indexed fromChain,
        address indexed token,
        bytes32 indexed orderId,
        bytes from,
        address to,
        uint256 amount
    );

    function setLightClientManager(address _managerAddress) external onlyRole(MANAGER_ROLE) {
        _checkAddress(_managerAddress);
        lightClientManager = ILightClientManager(_managerAddress);
        emit SetLightClientManager(_managerAddress);
    }

    function setTokenRegister(address _register) external onlyRole(MANAGER_ROLE) {
        _checkAddress(_register);
        tokenRegister = ITokenRegisterV3(_register);
        emit SetTokenRegister(_register);
    }

    function registerChain(
        uint256[] calldata _chainIds,
        bytes[] calldata _addresses,
        ChainType _type
    ) external onlyRole(MANAGER_ROLE) {
        uint256 len = _chainIds.length;
        if (len != _addresses.length) revert length_mismatching();
        for (uint256 i = 0; i < len; i++) {
            mosContracts[_chainIds[i]] = _addresses[i];
            chainTypes[_chainIds[i]] = _type;
            emit RegisterChain(_chainIds[i], _addresses[i], _type);
        }
    }

    function setDistributeRate( uint256 _id, address _to, uint256 _rate) external onlyRole(MANAGER_ROLE) {
        _checkAddress(_to);
        if (_id >= 3) revert invalid_rate_id();

        distributeRate[_id] = Rate(_to, _rate);

        if (
            (distributeRate[0].rate + distributeRate[1].rate + distributeRate[2].rate) > 1000000
        ) revert invalid_rate_value();
        emit SetDistributeRate(_id, _to, _rate);
    }

    function withdraw(address _vaultToken, uint256 _vaultAmount) external nonReentrant whenNotPaused {
        if (_vaultToken == address(0)) revert vault_token_not_registered();
        address token = IVaultTokenV3(_vaultToken).getTokenAddress();
        address vaultToken = tokenRegister.getVaultToken(token);
        if (_vaultToken != vaultToken) revert invalid_vault_token();
        uint256 amount = IVaultTokenV3(vaultToken).getTokenAmount(_vaultAmount);
        IVaultTokenV3(vaultToken).withdraw(
            selfChainId,
            _vaultAmount,
            msg.sender
        );
        _transferOut(token, msg.sender, amount, true);
    }

    function depositToken(
        address _token,
        address _to,
        uint256 _amount
    ) external payable override nonReentrant whenNotPaused returns(bytes32 orderId){
        address token = _transferIn(_token, msg.sender, _amount, true);
        _deposit(
            token,
            _toBytes(msg.sender),
            _to,
            _amount,
            bytes32(""),
            selfChainId
        );
    }

    function swapOutToken(
        address _initiator, // initiator address
        address _token, // src token
        bytes memory _to,
        uint256 _amount,
        uint256 _toChain, // target chain id
        bytes calldata _bridgeData
    ) external payable override nonReentrant whenNotPaused returns (bytes32 orderId)
    {
        if (_amount == 0) revert zero_amount();
        address from = msg.sender;
        address bridgeToken = _transferIn(_token, from, _amount, true);
        orderId = _swapOut(
            bridgeToken,
            _to,
            _initiator,
            _amount,
            _toChain,
            _bridgeData
        );
    }

    function bridgeIn(
        uint256 _chainId,
        uint256 _logIndex,
        bytes32 _orderId,
        bytes memory _receiptProof
    ) external override nonReentrant whenNotPaused {
        _checkOrder(_orderId);
        (bool success, string memory message, bytes memory logArray) = lightClientManager.verifyProofData(
            _chainId,
            _receiptProof
        );
        require(success, message);
        if (chainTypes[_chainId] == ChainType.EVM) {

            ILightVerifier.txLog memory log = LogDecode.decodeTxLog(logArray, _logIndex);
            if(log.addr != _fromBytes(mosContracts[_chainId])) revert invalid_mos_contract();
            if(log.topics[0] == EvmDecoder.MESSAGE_OUT_TOPIC) {
                SwapOutEvent memory outEvent = EvmDecoder.decodeMessageOut(log);
                _swapIn(_orderId, _chainId, outEvent);
            } else if(log.topics[0] == EvmDecoder.DEPOSITOUT_TOPIC){
                DepositOutEvent memory outEvent = EvmDecoder.decodeDepositOutLog(log);
                _depositIn(_orderId, _chainId, outEvent);
            } else {
                revert unknow_log();
            }

        } else if(chainTypes[_chainId] == ChainType.NEAR) {

            (bytes memory executorId, bytes32 topic, bytes memory log) = NearDecoder.getTopic(logArray, _logIndex);
            if(!_checkBytes(executorId, mosContracts[_chainId])) revert invalid_mos_contract();
            if(topic == NearDecoder.NEAR_SWAPOUT) {
                SwapOutEvent memory outEvent = NearDecoder.decodeNearSwapLog(log);
                _swapIn(_orderId, _chainId, outEvent);
            } else if(topic == NearDecoder.NEAR_DEPOSITOUT) {
                DepositOutEvent memory outEvent = NearDecoder.decodeNearDepositLog(log);
                _depositIn(_orderId, _chainId, outEvent);
            } else {
                revert unknow_log();
            }

        } else {
               revert chain_type_error();
        }
    }

    function getFee(uint256 _id, uint256 _amount) public view returns (uint256, address) {
        Rate memory rate = distributeRate[_id];
        return (((_amount * rate.rate) / 1000000), rate.receiver);
    }

    function getBridgeTokenInfo(
        uint256 _fromChain,
        uint256 _toChain,
        bytes memory _fromToken
    ) external view returns (bytes memory toChainToken, uint8 decimals, bool mintable)
    {
        return tokenRegister.getTargetToken(_fromChain, _toChain, _fromToken);
    }

    function getBridgeFeeInfo(
        bytes memory _caller,
        bytes memory _fromToken,
        uint256 _fromChain,
        uint256 _fromAmount,
        uint256 _toChain,
        bool _withSwap
    ) external view returns (uint256 fromChainFee, uint256 toChainAmount, uint256 vaultBalance)
    {
        return
            tokenRegister.getBridgeFeeInfoV3(
                _caller,
                _fromToken,
                _fromChain,
                _fromAmount,
                _toChain,
                _withSwap
            );
    }

    function getSourceFeeByTarget(
        bytes memory _caller,
        bytes memory _targetToken,
        uint256 _targetChain,
        uint256 _targetAmount,
        uint256 _fromChain,
        bool _withSwap
    ) external view returns (uint256 fromChainFee, uint256 toChainAmount, uint256 vaultBalance, bytes memory fromChainToken)
    {
        return tokenRegister.getSourceFeeByTargetV3(
                    _caller,
                    _targetToken,
                    _targetChain,
                    _targetAmount,
                    _fromChain,
                    _withSwap
               );
    }

    function _swapOut(
        address _token, // src token
        bytes memory _to,
        address _from,
        uint256 _amount,
        uint256 _toChain, // target chain id
        bytes calldata _swapData
    ) internal returns (bytes32 orderId) {
        _checkLimit(_amount, _toChain, _token);
        bytes memory toToken = tokenRegister.getToChainToken(_token, _toChain);
        if (!_checkBytes(toToken, bytes(""))) revert out_token_not_registered();
        orderId = _getOrderId(_from, _to, _toChain);
        if (_toChain == selfChainId) revert bridge_same_chain();
        _from = (msg.sender == butterRouter) ? _from : msg.sender;
        (, uint256 outAmount) = _collectFee(
            _toBytes(_from),
            orderId,
            _token,
            _amount,
            selfChainId,
            _toChain,
            _swapData.length != 0
        );
        _notifyLightClient(_toChain, bytes(""));
        _emitMessageRelayLog(
                orderId,
                selfChainId,
                _toChain,
                toToken,
                outAmount,
                _to,
                _toBytes(_from),
                _swapData
        );
    }

    function _swapIn(bytes32 _orderId,uint256 _chainId, SwapOutEvent memory _outEvent) internal {
        if(_orderId != _outEvent.orderId) revert invalid_order_Id();
        if(_fromBytes(_outEvent.mosOrRelay) != address(this)) revert invalid_mos_contract();
        if(_chainId != _outEvent.fromChain) revert invalid_chain_id();
        if(_outEvent.amount == 0) {
            // message bridge
        } else {
            // token bridge
            _swapInWithToken(_outEvent);
        }
    }

     function _swapInWithToken(SwapOutEvent memory _outEvent) internal {
        address token = tokenRegister.getRelayChainToken(_outEvent.fromChain, _outEvent.token);
        if(token == address(0)) revert token_not_registered();
        uint256 outAmount;
        {
            uint256 mapAmount = tokenRegister.getRelayChainAmount(token, _outEvent.fromChain, _outEvent.amount);
            (, outAmount) = _collectFee(
                _outEvent.from,
                _outEvent.orderId,
                token,
                mapAmount,
                _outEvent.fromChain,
                _outEvent.toChain,
                _outEvent.swapData.length != 0
            );
        }
        if (_outEvent.toChain == selfChainId) {
            _swapIn(
                _outEvent.orderId,
                token,
                _fromBytes(_outEvent.to),
                _outEvent.amount,
                _outEvent.fromChain,
                _outEvent.from,
                _outEvent.swapData
            );
        } else {
            _notifyLightClient(_outEvent.toChain, bytes(""));
            bytes memory toChainToken = tokenRegister.getToChainToken(token, _outEvent.toChain);
            if(!_checkBytes(toChainToken, bytes(""))) revert token_not_registered();
            _emitMessageRelayLog(
                _outEvent.orderId,
                _outEvent.fromChain,
                _outEvent.toChain,
                toChainToken,
                outAmount,
                _outEvent.to,
                _outEvent.from,
                _outEvent.swapData
            );
        }
     }

    function  _emitMessageRelayLog(
        bytes32 orderId,
        uint256 fromChain,
        uint256 toChain, 
        bytes memory token, 
        uint256 amount,
        bytes memory  to,
        bytes memory from,
        bytes memory message
    ) internal {
        uint256 chainAndGasLimit = _getChainAndGasLimit(
            uint64(fromChain),
            uint64(toChain),
            uint64(0)
        );
        if (chainTypes[toChain] == ChainType.EVM) {
                _emitMessageRelay(
                    orderId,
                    chainAndGasLimit,
                    _fromBytes(mosContracts[toChain]),
                    _fromBytes(token),
                    amount,
                    _fromBytes(to),
                    from,
                    message
                );
        } else {
                _emitMessageRelayPacked(
                    orderId,
                    chainAndGasLimit,
                    mosContracts[toChain],
                    token,
                    amount,
                    to,
                    from,
                    message
                );
        }
    }

    function _emitMessageRelay(
        bytes32 orderId,
        uint256 chainAndGasLimit,
        address mosRelay,
        address token,
        uint256 amount,
        address to,
        bytes memory from,
        bytes memory message
    ) internal {
        bytes memory messageData = abi.encode(
            mosRelay,
            token,
            amount,
            to,
            from,
            message
        );

        emit MessageRelay(orderId, chainAndGasLimit, messageData);
    }

    function _emitMessageRelayPacked(
        bytes32 orderId,
        uint256 chainAndGasLimit,
        bytes memory mosRelay,
        bytes memory token,
        uint256 amount,
        bytes memory to,
        bytes memory from,
        bytes memory message
    ) internal {
        bytes memory messageData = _pack(
            token,
            mosRelay,
            from,
            to,
            message,
            amount
        );
        emit MessageRelay(orderId, chainAndGasLimit, messageData);
    }

    function _pack(
        bytes memory token,
        bytes memory mosRelay,
        bytes memory from,
        bytes memory to,
        bytes memory swapData,
        uint256 amount
    ) internal pure returns (bytes memory packed) {
        uint256 word = _getWord(
            token.length,
            mosRelay.length,
            from.length,
            to.length,
            swapData.length,
            amount
        );
        packed = abi.encodePacked(word, token, mosRelay, from, to, swapData);
    }
    
    //   version (1 bytes)
    //   relay (1 bytes)
    //   token len (1 bytes)
    //   mos len (1 bytes)
    //   from len (1 bytes)
    //   to len (1 bytes)
    //   payload len (2 bytes)
    //   reserved (8 bytes)
    //   token amount (16 bytes)
    function _getWord(
        uint256 tokenLen,
        uint256 mosLen,
        uint256 fromLen,
        uint256 toLen,
        uint256 playloadLen,
        uint256 amount
    ) internal pure returns (uint256) {
        require(playloadLen <= type(uint16).max);
        require(amount <= type(uint128).max);
        require(toLen <= type(uint8).max);
        return ((version << 248)      |
                (tokenLen << 232)    |
                (mosLen << 224)      |
                (fromLen << 216)     |
                (toLen << 208)       |
                (playloadLen << 192) |
                amount);
    }

    function _notifyLightClient(uint256 _chainId, bytes memory _data) internal {
        lightClientManager.notifyLightClient(_chainId, address(this), _data);
    }

    function _depositIn(
        bytes32 _orderId,
        uint256 _chainId,
        DepositOutEvent memory _depositEvent
    ) internal {
        if(_fromBytes(_depositEvent.mosOrRelay) != address(this)) revert invalid_mos_contract();
        if(_orderId != _depositEvent.orderId) revert invalid_order_Id();
        if(_chainId != _depositEvent.fromChain || selfChainId != _chainId) revert invalid_chain_id();
        address token = tokenRegister.getRelayChainToken(_depositEvent.fromChain, _depositEvent.token);
        if(token == address(0)) revert token_not_registered();
        uint256 mapAmount = tokenRegister.getRelayChainAmount(token, _depositEvent.fromChain, _depositEvent.amount);
        // if (tokenRegister.checkMintable(token)) {
        //     IMintableToken(token).mint(address(this), mapAmount);
        // }
        _deposit(
            token,
            _depositEvent.from,
            _fromBytes(_depositEvent.to),
            mapAmount,
            _depositEvent.orderId,
            _depositEvent.fromChain
        );
    }

    function _deposit(
        address _token,
        bytes memory _from,
        address _to,
        uint256 _amount,
        bytes32 _orderId,
        uint256 _fromChain
    ) internal {
        address vaultToken = tokenRegister.getVaultToken(_token);
        if (vaultToken == address(0)) revert vault_token_not_registered();
        IVaultTokenV3(vaultToken).deposit(_fromChain, _amount, _to);
        emit DepositIn(_fromChain, _token, _orderId, _from, _to, _amount);
    }

    function isMintAble(address _token) internal view override returns(bool) {
        return tokenRegister.checkMintable(_token);
    }

    function _collectFee(
        bytes memory _caller,
        bytes32 _orderId,
        address _token,
        uint256 _relayAmount,
        uint256 _fromChain,
        uint256 _toChain,
        bool _withSwap
    ) internal returns (uint256 relayOutAmount, uint256 outAmount) {

        address vaultToken = tokenRegister.getVaultToken(_token);
        if(vaultToken == address(0)) revert vault_token_not_registered();

        uint256 proportionFee;
        uint256 excludeVaultFee = 0;
        uint256 totalFee;
        uint256 baseFee;

        (totalFee, baseFee, proportionFee) = tokenRegister.getTransferFeeV3(
            _caller,
            _token,
            _relayAmount,
            _fromChain,
            _toChain,
            _withSwap
        );
        if (_relayAmount >= totalFee) {
            relayOutAmount = _relayAmount - totalFee;
            outAmount = tokenRegister.getToChainAmount(_token, relayOutAmount, _toChain);
        } else if (_relayAmount >= baseFee) {
            proportionFee = _relayAmount - baseFee;
        } else {
            baseFee = _relayAmount;
            proportionFee = 0;
        }

        if (baseFee != 0) {
            address baseFeeReceiver = tokenRegister.getBaseFeeReceiver();
            _transferOut(_token, baseFeeReceiver, baseFee, true);
            excludeVaultFee += baseFee;
        }

        if (proportionFee > 0) {
            excludeVaultFee += _collectBridgeFee(_orderId, _token, baseFee, proportionFee);
        }

        IVaultTokenV3(vaultToken).transferToken(
            _fromChain,
            _relayAmount,
            _toChain,
            relayOutAmount,
            selfChainId,
            excludeVaultFee
        );
        return (relayOutAmount, outAmount);
    }

    function _collectBridgeFee(
        bytes32 _orderId,
        address _token,
        uint256 baseFee,
        uint256 proportionFee
    ) internal returns (uint256 excludeVaultFee) {
        uint256 messageFee;
        uint256 protocolFee;
        address receiver;

        excludeVaultFee = 0;

        // messenger fee
        (messageFee, receiver) = getFee(1, proportionFee);
        if (messageFee != 0 && receiver != address(0)) {
            _transferOut(_token, receiver, messageFee, true);

            excludeVaultFee += messageFee;
        }
        // protocol fee
        (protocolFee, receiver) = getFee(2, proportionFee);
        if (protocolFee != 0 && receiver != address(0)) {
            _transferOut(_token, receiver, protocolFee, true);

            excludeVaultFee += protocolFee;
        }

        uint256 vaultFee = proportionFee - messageFee - protocolFee;

        emit CollectFee(_orderId, _token, baseFee, proportionFee, messageFee, vaultFee, protocolFee);
    }

    function transferOut(
        uint256 _toChain,
        bytes memory _messageData,
        address _feeToken
    ) external payable override returns (bytes32) {}
}
