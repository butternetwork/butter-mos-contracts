// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

import "./lib/NearDecoder.sol";
import "./interface/IMOSV3.sol";
import "./interface/IMapoExecutor.sol";
import "@mapprotocol/protocol/contracts/interface/ILightClientManager.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";

interface IBridge {
    function orderList(bytes32 orderId) external view returns (bool);
}

contract NearAdaptor is UUPSUpgradeable, AccessControlEnumerableUpgradeable {
    uint256 public immutable selfChainId = block.chainid;
    bytes32 public constant MANAGE_ROLE = keccak256("MANAGE_ROLE");
    bytes32 public constant UPGRADE_ROLE = keccak256("UPGRADE_ROLE");

    IMOSV3 public mos;
    bytes public nearMos;
    uint256 public nearChainId;
    uint256 private nonce;
    address public bridge;
    uint256 public gasLimit;
    ILightClientManager public lightClientManager;

    enum OutType {
        SWAP,
        DEPOSIT
    }
    event MapSwapOut(
        uint256 indexed fromChain, // from chain
        uint256 indexed toChain, // to chain
        bytes32 orderId, // order id
        bytes token, // token to transfer
        bytes from, // source chain from address
        bytes to,
        uint256 amount,
        bytes swapData // swap data, used on target chain dex.
    );

    event SetBridge(address _bridge);
    event SetGasLimit(uint256 _gasLimit);
    event SetLightNode(address _lightNode);
    event SetMos(address _mos, bytes _nearMos);
    event Relay(bytes32 v2OrderId, bytes32 V3OrderId);

    receive() external payable {}

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _defaultAdmin) public initializer {
        __AccessControlEnumerable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, _defaultAdmin);
        _grantRole(MANAGE_ROLE, _defaultAdmin);
    }

    function setMos(address _mos, bytes memory _nearMos) external onlyRole(MANAGE_ROLE) {
        mos = IMOSV3(_mos);
        nearMos = _nearMos;
        emit SetMos(_mos, _nearMos);
    }

    function setBridge(address _bridge) external onlyRole(MANAGE_ROLE) {
        bridge = _bridge;
        emit SetBridge(_bridge);
    }

    function setGasLimit(uint256 _gasLimit) external onlyRole(MANAGE_ROLE) {
        gasLimit = _gasLimit;
        emit SetGasLimit(_gasLimit);
    }

    function setLightNode(address _lightNode) external onlyRole(MANAGE_ROLE) {
        lightClientManager = ILightClientManager(_lightNode);
        emit SetLightNode(_lightNode);
    }

    function getOrderStatus(
        uint256,
        uint256 _blockNum,
        bytes32 _orderId
    ) external view returns (bool exists, bool verifiable, uint256 nodeType) {
        exists = IBridge(bridge).orderList(_orderId);
        verifiable = lightClientManager.isVerifiable(nearChainId, _blockNum, bytes32(""));
        nodeType = lightClientManager.nodeType(nearChainId);
    }

    function transferOut(
        uint256 toChain,
        bytes memory messageData,
        uint256 fromChain
    ) external payable returns (bytes32) {
        return _transferOut(toChain, messageData, fromChain);
    }

    function _transferOut(uint256 toChain, bytes memory messageData, uint256 fromChain) private returns (bytes32) {
        IMOSV3.MessageData memory m = abi.decode(messageData, (IMOSV3.MessageData));
        NearDecoder.SwapOutEvent memory s;
        (s.orderId, s.token, s.amount, s.to, s.from, s.swapData) = abi.decode(
            m.payload,
            (bytes32, bytes, uint256, bytes, bytes, bytes)
        );
        emit MapSwapOut(fromChain, toChain, s.orderId, s.token, s.from, s.to, s.amount, s.swapData);
        _notifyLightClient("");
        return s.orderId;
    }

    function swapIn(uint256 _chainId, bytes memory _receiptProof) external {
        (bool success, string memory message, bytes memory logArray) = lightClientManager.verifyProofDataWithCache(
            nearChainId,
            _receiptProof
        );
        require(success, message);
        (bytes memory mosContract, NearDecoder.SwapOutEvent[] memory outEvents) = NearDecoder.decodeNearSwapLog(
            logArray
        );
        for (uint256 i = 0; i < outEvents.length; i++) {
            NearDecoder.SwapOutEvent memory outEvent = outEvents[i];
            if (outEvent.toChain == 0) {
                continue;
            }
            require(Utils.checkBytes(mosContract, nearMos), "invalid mos contract");
            _swapIn(outEvent);
        }
    }

    function depositIn(bytes memory _receiptProof) external {
        (bool success, string memory message, bytes memory logArray) = lightClientManager.verifyProofDataWithCache(
            nearChainId,
            _receiptProof
        );
        require(success, message);
        (bytes memory mosContract, NearDecoder.depositOutEvent[] memory outEvents) = NearDecoder.decodeNearDepositLog(
            logArray
        );
        for (uint256 i = 0; i < outEvents.length; i++) {
            NearDecoder.depositOutEvent memory outEvent = outEvents[i];
            if (outEvent.toChain == 0) {
                continue;
            }
            require(Utils.checkBytes(mosContract, nearMos), "invalid mos contract");
            _depositIn(outEvent);
        }
    }

    function _depositIn(NearDecoder.depositOutEvent memory outEvent) private {
        bytes memory payload = abi.encode(outEvent.token, outEvent.amount, outEvent.from, outEvent.to);
        payload = abi.encode(OutType.DEPOSIT, payload);
        IMapoExecutor(bridge).mapoExecute(outEvent.fromChain, outEvent.toChain, nearMos, outEvent.orderId, payload);
    }

    function _swapIn(NearDecoder.SwapOutEvent memory outEvent) private {
        bytes memory payload = abi.encode(
            gasLimit,
            outEvent.token,
            outEvent.amount,
            outEvent.from,
            outEvent.to,
            outEvent.swapData
        );
        payload = abi.encode(OutType.SWAP, payload);
        uint256 value;
        if (outEvent.toChain != selfChainId) {
            (value, ) = mos.getMessageFee(outEvent.toChain, address(0), gasLimit);
        }
        IMapoExecutor(bridge).mapoExecute{value: value}(
            outEvent.fromChain,
            outEvent.toChain,
            nearMos,
            outEvent.orderId,
            payload
        );
    }

    function _notifyLightClient(bytes memory _data) internal {
        lightClientManager.notifyLightClient(nearChainId, address(this), _data);
    }

    /** UUPS *********************************************************/
    function _authorizeUpgrade(address) internal view override {
        require(hasRole(UPGRADE_ROLE, msg.sender), "Bridge: only Admin can upgrade");
    }

    function getImplementation() external view returns (address) {
        return _getImplementation();
    }
}
