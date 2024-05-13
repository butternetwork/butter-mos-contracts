// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

import "./lib/Helper.sol";
import "./interface/IMOSV3.sol";
import "./abstract/BridgeAbstract.sol";
import "./interface/IMintableToken.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

contract BridgeAndRelay is BridgeAbstract {
    using AddressUpgradeable for address;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    struct DepositParam {
        address from;
        address token;
        address to;
        uint256 amount;
        uint256 gasLimit;
    }
    address public relayContract;
    uint256 public relayChainId;
    mapping(address => bool) public mintableTokens;
    mapping(uint256 => mapping(address => bool)) public tokenMappingList;

    event AddMintableToken(address[] _token);
    event RemoveMintableToken(address[] _token);
    event SetRelayContract(uint256 _chainId, address _relay);
    event RegisterToken(address _token, uint256 _toChain, bool _enable);
    event Deposit(
        bytes32 orderId,
        address token,
        address from,
        address to,
        uint256 amount,
        uint256 gasLimit,
        uint256 messageFee
    );

    function addMintableToken(address[] memory _tokens) external onlyRole(MANAGE_ROLE) {
        for (uint256 i = 0; i < _tokens.length; i++) {
            mintableTokens[_tokens[i]] = true;
        }
        emit AddMintableToken(_tokens);
    }

    function removeMintableToken(address[] memory _tokens) external onlyRole(MANAGE_ROLE) {
        for (uint256 i = 0; i < _tokens.length; i++) {
            mintableTokens[_tokens[i]] = false;
        }
        emit RemoveMintableToken(_tokens);
    }

    function setRelayContract(uint256 _chainId, address _relay) external onlyRole(MANAGE_ROLE) checkAddress(_relay) {
        relayContract = _relay;
        relayChainId = _chainId;
        emit SetRelayContract(_chainId, _relay);
    }

    function registerTokenChains(
        address _token,
        uint256[] memory _toChains,
        bool _enable
    ) external onlyRole(MANAGE_ROLE) {
        require(_token.isContract(), "token is not contract");
        for (uint256 i = 0; i < _toChains.length; i++) {
            uint256 toChain = _toChains[i];
            tokenMappingList[toChain][_token] = _enable;
            emit RegisterToken(_token, toChain, _enable);
        }
    }

    function swapOut(SwapOutParam calldata param) external payable override nonReentrant whenNotPaused {
        require(param.toChain != selfChainId, "Cannot swap to self chain");
        (address token, , uint256 messageFee) = _tokenIn(
            param.toChain,
            param.amount,
            param.token,
            param.gasLimit,
            param.relayGasLimit
        );
        _checkLimit(param.amount, param.toChain, token);
        checkBridgeable(token, param.toChain);
        bytes32 orderId;
        {
            bytes memory payload = abi.encode(
                param.gasLimit,
                abi.encodePacked(param.token),
                param.amount,
                param.from,
                param.to,
                param.swapData
            );
            payload = abi.encode(OutType.SWAP, payload);
            IMOSV3.MessageData memory messageData = IMOSV3.MessageData({
                relay: param.toChain != relayChainId,
                msgType: IMOSV3.MessageType.MESSAGE,
                target: abi.encodePacked(relayContract),
                payload: payload,
                gasLimit: param.relayGasLimit,
                value: 0
            });
            orderId = mos.transferOut{value: messageFee}(param.toChain, abi.encode(messageData), Helper.ZERO_ADDRESS);
        }
        emit SwapOut(
            orderId,
            param.toChain,
            param.token,
            param.amount,
            param.from,
            param.to,
            param.gasLimit,
            param.relayGasLimit,
            messageFee,
            param.swapData
        );
    }

    function deposit(DepositParam calldata param) external payable nonReentrant whenNotPaused {
        (address token, , uint256 messageFee) = _tokenIn(relayChainId, param.amount, param.token, param.gasLimit, 0);
        checkBridgeable(token, relayChainId);
        bytes memory payload = abi.encode(abi.encodePacked(param.token), param.amount, param.from, param.to);
        payload = abi.encode(OutType.DEPOSIT, payload);
        IMOSV3.MessageData memory messageData = IMOSV3.MessageData({
            relay: false,
            msgType: IMOSV3.MessageType.MESSAGE,
            target: abi.encodePacked(relayContract),
            payload: payload,
            gasLimit: param.gasLimit,
            value: 0
        });
        bytes32 orderId = mos.transferOut{value: messageFee}(
            relayChainId,
            abi.encode(messageData),
            Helper.ZERO_ADDRESS
        );
        emit Deposit(orderId, param.token, param.from, param.to, param.amount, param.gasLimit, messageFee);
    }

    function mapoExecute(
        uint256 _fromChain,
        uint256 _toChain,
        bytes calldata _fromAddress,
        bytes32 _orderId,
        bytes calldata _message
    ) external override nonReentrant checkOrder(_orderId) returns (bytes memory newMessage) {
        require(_fromChain == relayChainId && _toChain == selfChainId, "invalid chain id");
        address relay = _fromBytes(_fromAddress);
        require(relay == relayContract, "not relay");
        SwapInParam memory param;
        param.fromChain = _fromChain;
        param.orderId = _orderId;
        bytes memory token;
        uint256 amount;
        bytes memory to;
        (token, param.amount, to, param.from, param.swapData) = abi.decode(
            _message,
            (bytes, uint256, bytes, bytes, bytes)
        );
        param.token = _fromBytes(token);
        param.to = _fromBytes(to);
        if (isMintable(param.token)) {
            IMintableToken(param.token).mint(address(this), amount);
        }
        _swapIn(param);
        return bytes("");
    }

    function _getMessageFee(
        uint256 gasLimit,
        uint256 relayGasLimit,
        uint256 tochain
    ) internal view override returns (uint256 fee) {
        (fee, ) = mos.getMessageFee(tochain, Helper.ZERO_ADDRESS, gasLimit);
        if (tochain != relayChainId) {
            (uint256 relayFee, ) = mos.getMessageFee(relayChainId, Helper.ZERO_ADDRESS, relayGasLimit);
            fee += relayFee;
        }
    }

    function isMintable(address _token) public view override returns (bool) {
        return mintableTokens[_token];
    }

    function checkBridgeable(address _token, uint256 _chainId) private view {
        require(tokenMappingList[_chainId][_token], "token not registered");
    }
}
