// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

import "./lib/Helper.sol";
import "./interface/IMOSV3.sol";
import "./interface/IVaultTokenV3.sol";
import "./abstract/BridgeAbstract.sol";
import "./interface/IMintableToken.sol";
import "./interface/ITokenRegisterV3.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

interface IAdapter {
    function transferOut(
        uint256 toChain,
        bytes memory messageData,
        uint256 fromChain
    ) external payable returns (bytes32);
}

contract BridgeAndRelay is BridgeAbstract {
    using AddressUpgradeable for address;
    using SafeERC20Upgradeable for IERC20Upgradeable;

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

    mapping(uint256 => bytes) public bridges;
    mapping(uint256 => ChainType) public chainTypes;

    ITokenRegisterV3 public tokenRegister;
    //id : 0 VToken  1:relayer
    mapping(uint256 => Rate) public distributeRate;

    uint256 public adaptorChainId;
    address public adaptor; // near adaptor
    address public butterRouter;

    event SetButterRouter(address _butterRouter);
    event SetTokenRegister(address tokenRegister);
    event RegisterChain(uint256 chainId, bytes bridge, ChainType chainType);
    event SetAdaptor(uint256 chainId, address adptor);
    event SetDistributeRate(uint256 id, address to, uint256 rate);

    event DepositIn(
        uint256 indexed fromChain,
        address indexed token,
        bytes32 indexed orderId,
        bytes from,
        address to,
        uint256 amount
    );

    function setAdaptor(uint256 _chainId, address _adaptor) external onlyRole(MANAGER_ROLE) {
        adaptorChainId = _chainId;
        adaptor = _adaptor;
        emit SetAdaptor(_chainId, _adaptor);
    }

    function setButterRouter(address _butterRouter) external onlyRole(MANAGER_ROLE) {
        butterRouter = _butterRouter;
        emit SetButterRouter(_butterRouter);
    }

    function setTokenRegister(address _register) external onlyRole(MANAGER_ROLE) checkAddress(_register) {
        tokenRegister = ITokenRegisterV3(_register);
        emit SetTokenRegister(_register);
    }

    function registerChain(
        uint256[] calldata _chainIds,
        bytes[] calldata _addresses,
        ChainType _type
    ) external onlyRole(MANAGER_ROLE) {
        uint256 len = _chainIds.length;
        require(len == _addresses.length, "length mismatching");
        for (uint256 i = 0; i < len; i++) {
            bridges[_chainIds[i]] = _addresses[i];
            chainTypes[_chainIds[i]] = _type;
            emit RegisterChain(_chainIds[i], _addresses[i], _type);
        }
    }

    function setDistributeRate(
        uint256 _id,
        address _to,
        uint256 _rate
    ) external onlyRole(MANAGER_ROLE) checkAddress(_to) {
        require(_id < 3, "Invalid rate id");

        distributeRate[_id] = Rate(_to, _rate);

        require(
            distributeRate[0].rate + distributeRate[1].rate + distributeRate[2].rate <= 1000000,
            "invalid rate value"
        );
        emit SetDistributeRate(_id, _to, _rate);
    }

    function withdraw(address _vaultToken, uint256 _vaultAmount) external whenNotPaused {
        require(_vaultToken != address(0), "vault token not registered");
        address token = IVaultTokenV3(_vaultToken).getTokenAddress();
        address vaultToken = tokenRegister.getVaultToken(token);
        require(_vaultToken == vaultToken, "Invalid vault token");
        uint256 amount = IVaultTokenV3(vaultToken).getTokenAmount(_vaultAmount);
        IVaultTokenV3(vaultToken).withdraw(selfChainId, _vaultAmount, msg.sender);
        _withdraw(token, msg.sender, amount);
    }

    function depositToken(
        address _token,
        address _to,
        uint256 _amount
    ) external payable override nonReentrant whenNotPaused {
        (address token, , ) = _tokenIn(selfChainId, _amount, _token, 0, false);
        _deposit(token, abi.encodePacked(msg.sender), _to, _amount, bytes32(""), selfChainId);
    }

    function swapOutToken(
        address _initiator, // initiator address
        address _token, // src token
        bytes memory _to,
        uint256 _amount,
        uint256 _toChain, // target chain id
        bytes calldata _bridgeData
    ) external payable override nonReentrant whenNotPaused returns (bytes32 orderId) {
        require(!_checkBytes(bridges[_toChain], bytes("")), "bridge not registered");

        bytes memory toToken = tokenRegister.getToChainToken(_token, _toChain);
        require(!_checkBytes(toToken, bytes("")), "token not registered");

        BridgeParam memory bridge;
        SwapParam memory param;
        uint256 messageFee;

        (param, bridge, messageFee) = _swapOutInit(_initiator, _token, _to, _amount, _toChain, _bridgeData);

        if (isOmniToken(param.token)) {
            // param.amount = _amount;
            orderId = _interTransferAndCall(param, bridge, bridges[param.toChain], messageFee);
        } else {
            orderId = _getOrderId(param.from, param.toBytes, param.toChain);
            param.caller = (msg.sender == butterRouter) ? abi.encodePacked(_initiator) : abi.encodePacked(msg.sender);
            uint256 mapOutAmount;
            (param.relayOutAmount, param.toAmount, param.baseFee) = _collectFee(
                param.caller,
                param.token,
                param.amount,
                selfChainId,
                param.toChain,
                bridge.swapData.length != 0
            );
            _checkAndBurn(param.token, param.relayOutAmount);
            bytes memory payload = abi.encode(
                orderId,
                toToken,
                param.toAmount,
                param.toBytes,
                param.fromBytes,
                bridge.swapData
            );
            IMOSV3.MessageData memory messageData = IMOSV3.MessageData({
                relay: false,
                msgType: IMOSV3.MessageType.MESSAGE,
                target: bridges[param.toChain],
                payload: payload,
                gasLimit: param.gasLimit,
                value: 0
            });
            if (param.toChain == adaptorChainId) {
                IAdapter(adaptor).transferOut{value: messageFee}(param.toChain, abi.encode(messageData), selfChainId);
            } else {
                mos.messageOut{value: messageFee}(0x00, param.from, Helper.ZERO_ADDRESS, param.toChain, abi.encode(messageData), Helper.ZERO_ADDRESS);
            }
            emit CollectFee(orderId, param.token, (_amount - mapOutAmount));
        }
        emit SwapOut(
            orderId,
            param.toChain,
            _token,
            param.amount,
            param.from,
            msg.sender,
            param.toBytes,
            toToken,
            param.gasLimit,
            messageFee
        );
    }

    function mapoExecute(
        uint256 _fromChain,
        uint256 _toChain,
        bytes calldata _fromAddress,
        bytes32 _orderId,
        bytes calldata _message
    ) external payable override nonReentrant checkOrder(_orderId) returns (bytes memory newMessage) {
        require(msg.sender == address(mos) || msg.sender == adaptor, "only mos");
        require(_checkBytes(_fromAddress, bridges[_fromChain]), "invalid from");
        OutType outType;
        bytes memory payload;
        (outType, payload) = abi.decode(_message, (OutType, bytes));
        if (outType == OutType.SWAP) {
            return _dealWithSwapOut(_orderId, _fromChain, _toChain, payload);
        } else {
            return _dealWithDeposit(_orderId, _fromChain, _toChain, payload);
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
    ) external view returns (bytes memory toChainToken, uint8 decimals, bool mintable) {
        return tokenRegister.getTargetToken(_fromChain, _toChain, _fromToken);
    }

    function getBridgeFeeInfo(
        bytes memory _caller,
        bytes memory _fromToken,
        uint256 _fromChain,
        uint256 _fromAmount,
        uint256 _toChain,
        bool _withSwap
    ) external view returns (uint256 fromChainFee, uint256 toChainAmount, uint256 vaultBalance) {
        return tokenRegister.getBridgeFeeInfoV3(_caller, _fromToken, _fromChain, _fromAmount, _toChain, _withSwap);
    }

    function getSourceFeeByTarget(
        bytes memory _caller,
        bytes memory _targetToken,
        uint256 _targetChain,
        uint256 _targetAmount,
        uint256 _fromChain,
        bool _withSwap
    )
        external
        view
        returns (uint256 fromChainFee, uint256 toChainAmount, uint256 vaultBalance, bytes memory fromChainToken)
    {
        return
            tokenRegister.getSourceFeeByTargetV3(
                _caller,
                _targetToken,
                _targetChain,
                _targetAmount,
                _fromChain,
                _withSwap
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
        require(vaultToken != address(0), "vault token not registered");
        IVaultTokenV3(vaultToken).deposit(_fromChain, _amount, _to);
        emit DepositIn(_fromChain, _token, _orderId, _from, _to, _amount);
    }

    function _dealWithSwapOut(
        bytes32 orderId,
        uint256 fromChain,
        uint256 toChain,
        bytes memory payload
    ) private returns (bytes memory) {
        SwapParam memory param;
        param.fromChain = fromChain;
        param.toChain = toChain;
        param.orderId = orderId;
        bytes memory token;
        bytes memory swapData;

        (param.gasLimit, token, param.amount, param.fromBytes, param.toBytes, swapData, param.caller) = abi.decode(
            payload,
            (uint256, bytes, uint256, bytes, bytes, bytes, bytes)
        );
        param.token = tokenRegister.getRelayChainToken(param.fromChain, token);
        require(param.token != address(0), "relay token not registered");
        {
            param.relayAmount = tokenRegister.getRelayChainAmount(param.token, param.fromChain, param.amount);
            _checkAndMint(param.token, param.relayAmount);
            (param.relayOutAmount, param.toAmount, param.baseFee) = _collectFee(
                param.caller,
                param.token,
                param.relayAmount,
                param.fromChain,
                param.toChain,
                swapData.length != 0
            );
            emit CollectFee(param.orderId, param.token, (param.relayAmount - param.relayOutAmount));
        }
        if (toChain == selfChainId) {
            param.amount = param.relayOutAmount;
            _swapIn(param, swapData);
            return bytes("");
        } else {
            return _swapRelay(param, swapData);
        }
    }

    function _swapRelay(SwapParam memory param, bytes memory swapData) internal returns (bytes memory) {
        IMOSV3.MessageData memory messageData;

        bytes memory toToken = tokenRegister.getToChainToken(param.token, param.toChain);
        require(!_checkBytes(toToken, bytes("")), "Out token not registered");
        _checkAndBurn(param.token, param.relayOutAmount);
        bytes memory m = abi.encode(param.orderId, toToken, param.toAmount, param.toBytes, param.fromBytes, swapData);
        messageData = IMOSV3.MessageData({
            relay: true,
            msgType: IMOSV3.MessageType.MESSAGE,
            target: bridges[param.toChain],
            payload: m,
            gasLimit: param.gasLimit,
            value: 0
        });

        bytes memory payLoad = abi.encode(messageData);
        if (param.toChain == adaptorChainId) {
            // other chain -> mapo -> near
            // todo
            IAdapter(adaptor).transferOut(param.toChain, payLoad, param.fromChain);
            // todo: return messageData for MOS processing

            emit Relay(param.orderId, param.orderId);
            return bytes("");
        }

        if (param.fromChain == adaptorChainId) {
            // near -> mapo -> other chain
            //(uint256 msgFee, ) = mos.getMessageFee(toChain, address(0), gasLimit);
            bytes32 v3OrderId = mos.transferOut{value: msg.value}(param.toChain, payLoad, address(0));
            emit Relay(param.orderId, v3OrderId);

            return payLoad;
        }

        emit Relay(param.orderId, param.orderId);
        return payLoad;
    }

    function _dealWithDeposit(
        bytes32 orderId,
        uint256 fromChain,
        uint256 toChain,
        bytes memory payload
    ) private returns (bytes memory) {
        require(selfChainId == toChain, "invalid chain");
        (bytes memory token, uint256 amount, bytes memory from, address to) = abi.decode(
            payload,
            (bytes, uint256, bytes, address)
        );
        address relayToken = tokenRegister.getRelayChainToken(fromChain, token);
        require(relayToken != address(0), "map token not registered");
        uint256 mapAmount = tokenRegister.getRelayChainAmount(relayToken, fromChain, amount);
        _checkAndMint(relayToken, mapAmount);
        _deposit(relayToken, from, to, mapAmount, orderId, fromChain);
        return bytes("");
    }

    function _collectFee(
        bytes memory _caller,
        address _token,
        uint256 _relayAmount,
        uint256 _fromChain,
        uint256 _toChain,
        bool _withSwap
    ) private returns (uint256 relayOutAmount, uint256 outAmount, uint256 baseFee) {
        address vaultToken = tokenRegister.getVaultToken(_token);
        require(vaultToken != address(0), "vault token not registered");
        uint256 bridgeFee;
        uint256 excludeVaultFee = 0;
        {
            uint256 totalFee;
            (totalFee, baseFee, bridgeFee) = tokenRegister.getTransferFee(
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
                bridgeFee = _relayAmount - baseFee;
            } else {
                baseFee = _relayAmount;
                bridgeFee = 0;
            }
            excludeVaultFee = baseFee;
            if (baseFee != 0) {
                address baseFeeReceiver = tokenRegister.getBaseFeeReceiver();
                _withdraw(_token, baseFeeReceiver, baseFee);
            }
        }
        if (bridgeFee > 0) {
            excludeVaultFee += _collectServiceFee(_token, bridgeFee);
        }
        // left for vault fee
        IVaultTokenV3(vaultToken).transferToken(
            _fromChain,
            _relayAmount,
            _toChain,
            relayOutAmount,
            selfChainId,
            excludeVaultFee
        );
        return (relayOutAmount, outAmount, baseFee);
    }

    function _collectServiceFee(address _token, uint256 _proportionFee) internal returns (uint256 excludeVaultFee) {
        uint256 fee;
        address receiver;
        // messenger fee
        (fee, receiver) = getFee(1, _proportionFee);
        if (fee != 0 && receiver != address(0)) {
            _withdraw(_token, receiver, fee);
            excludeVaultFee += fee;
        }
        // protocol fee
        (fee, receiver) = getFee(2, _proportionFee);
        if (fee != 0 && receiver != address(0)) {
            _withdraw(_token, receiver, fee);
            excludeVaultFee += fee;
        }
    }
}
