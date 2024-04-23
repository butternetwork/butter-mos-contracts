// SPDX-License-Identifier: MIT

pragma solidity 0.8.7;

import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@mapprotocol/protocol/contracts/interface/ILightNode.sol";
import "@mapprotocol/protocol/contracts/utils/Utils.sol";
import "@mapprotocol/protocol/contracts/lib/RLPReader.sol";
import "./interface/IWrappedToken.sol";
import "./interface/IMintableToken.sol";
import "./interface/IButterReceiver.sol";
import "./interface/IButterMosV2.sol";
import "./utils/EvmDecoder.sol";

contract MAPOmnichainServiceV2 is ReentrancyGuard, Initializable, Pausable, IButterMosV2, UUPSUpgradeable {
    using SafeMath for uint256;
    using RLPReader for bytes;
    using RLPReader for RLPReader.RLPItem;
    using Address for address;

    uint256 public immutable selfChainId = block.chainid;
    uint256 public nonce;
    address public wToken; // native wrapped token
    address public relayContract;
    uint256 public relayChainId;
    ILightNode public lightNode;

    enum chainType {
        NULL,
        EVM,
        NEAR
    }

    mapping(bytes32 => bool) public orderList;
    mapping(address => bool) public mintableTokens;
    mapping(uint256 => mapping(address => bool)) public tokenMappingList;
    //pre version,now placeholder the slot
    address public butterRouter;

    // reserved
    IEvent.swapOutEvent[] private verifiedLogs;

    mapping(bytes32 => bool) public storedOrderId; // log hash

    event SetButterRouterAddress(address indexed _newRouter);

    event mapTransferExecute(uint256 indexed fromChain, uint256 indexed toChain, address indexed from);
    event SetLightClient(address _lightNode);
    event AddMintableToken(address[] _token);
    event RemoveMintableToken(address[] _token);
    event SetRelayContract(uint256 _chainId, address _relay);
    event RegisterToken(address _token, uint256 _toChain, bool _enable);
    event RegisterChain(uint256 _chainId, chainType _type);
    event mapSwapExecute(uint256 indexed fromChain, uint256 indexed toChain, address indexed from);
    event mapSwapInVerified(bytes logs);

    function initialize(
        address _wToken,
        address _lightNode,
        address _owner
    ) public initializer checkAddress(_wToken) checkAddress(_lightNode) checkAddress(_owner) {
        wToken = _wToken;
        lightNode = ILightNode(_lightNode);
        _changeAdmin(_owner);
    }

    receive() external payable {}

    modifier checkOrder(bytes32 _orderId) {
        require(!orderList[_orderId], "order exist");
        orderList[_orderId] = true;
        _;
    }

    modifier checkBridgeable(address _token, uint256 _chainId) {
        require(tokenMappingList[_chainId][_token], "token not registered");
        _;
    }

    modifier checkAddress(address _address) {
        require(_address != address(0), "address is zero");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == _getAdmin(), "mos :: only admin");
        _;
    }

    function setPause() external onlyOwner {
        _pause();
    }

    function setUnpause() external onlyOwner {
        _unpause();
    }

    function setLightClient(address _lightNode) external onlyOwner checkAddress(_lightNode) {
        lightNode = ILightNode(_lightNode);
        emit SetLightClient(_lightNode);
    }

    function addMintableToken(address[] memory _token) external onlyOwner {
        for (uint256 i = 0; i < _token.length; i++) {
            mintableTokens[_token[i]] = true;
        }
        emit AddMintableToken(_token);
    }

    function removeMintableToken(address[] memory _token) external onlyOwner {
        for (uint256 i = 0; i < _token.length; i++) {
            mintableTokens[_token[i]] = false;
        }
        emit RemoveMintableToken(_token);
    }

    function setRelayContract(uint256 _chainId, address _relay) external onlyOwner checkAddress(_relay) {
        relayContract = _relay;
        relayChainId = _chainId;

        emit SetRelayContract(_chainId, _relay);
    }

    function registerToken(address _token, uint256 _toChain, bool _enable) external onlyOwner {
        require(_token.isContract(), "token is not contract");
        tokenMappingList[_toChain][_token] = _enable;
        emit RegisterToken(_token, _toChain, _enable);
    }

    // ------------------------------------------

    function swapOutToken(
        address _initiatorAddress, // swap initiator address
        address _token, // src token
        bytes memory _to,
        uint256 _amount,
        uint256 _toChain, // target chain id
        bytes calldata _swapData
    ) external virtual override nonReentrant whenNotPaused checkBridgeable(_token, _toChain) returns (bytes32 orderId) {
        require(_amount > 0, "Sending value is zero");
        require(IERC20(_token).balanceOf(msg.sender) >= _amount, "Insufficient token balance");
        if (isMintable(_token)) {
            IMintableToken(_token).burnFrom(msg.sender, _amount);
        } else {
            SafeERC20.safeTransferFrom(IERC20(_token), msg.sender, address(this), _amount);
        }
        orderId = _swapOut(_token, _to, _initiatorAddress, _amount, _toChain, _swapData);
    }

    function swapOutNative(
        address _initiatorAddress, // swap initiator address
        bytes memory _to,
        uint256 _toChain, // target chain id
        bytes calldata _swapData
    )
        external
        payable
        virtual
        override
        nonReentrant
        whenNotPaused
        checkBridgeable(wToken, _toChain)
        returns (bytes32 orderId)
    {
        uint256 amount = msg.value;
        require(amount > 0, "Sending value is zero");
        IWrappedToken(wToken).deposit{value: amount}();
        orderId = _swapOut(wToken, _to, _initiatorAddress, amount, _toChain, _swapData);
    }

    function depositToken(
        address _token,
        address _to,
        uint256 _amount
    ) external override nonReentrant whenNotPaused checkBridgeable(_token, relayChainId) {
        address from = msg.sender;
        require(_amount > 0, "Sending value is zero");
        //require(IERC20(token).balanceOf(_from) >= _amount, "balance too low");

        if (isMintable(_token)) {
            IMintableToken(_token).burnFrom(from, _amount);
        } else {
            SafeERC20.safeTransferFrom(IERC20(_token), from, address(this), _amount);
        }
        _deposit(_token, from, _to, _amount);
    }

    function depositNative(
        address _to
    ) external payable override nonReentrant whenNotPaused checkBridgeable(wToken, relayChainId) {
        address from = msg.sender;
        uint256 amount = msg.value;
        require(amount > 0, "Sending value is zero");
        IWrappedToken(wToken).deposit{value: amount}();
        _deposit(wToken, from, _to, amount);
    }

    // verify swap in logs and store hash
    function swapInVerify(uint256 _chainId, bytes memory _receiptProof) external nonReentrant whenNotPaused {
        require(_chainId == relayChainId, "invalid chain id");
        (bool success, string memory message, bytes memory logArray) = lightNode.verifyProofDataWithCache(_receiptProof);
        require(success, message);
        bytes32 hash = keccak256(logArray);
        require(!storedOrderId[hash], "already verified");
        storedOrderId[hash] = true;
        emit mapSwapInVerified(logArray);
    }

    // execute stored swap in logs
    function swapInVerifiedWithIndex(bytes calldata logArray,uint256 logIndex) external nonReentrant whenNotPaused {
        bytes32 hash = keccak256(logArray);
        require(storedOrderId[hash], "not verified");
        _swapInVerifiedWithIndex(logArray,logIndex);
    }

    function swapIn(uint256 _chainId,bytes memory _receiptProof) external nonReentrant whenNotPaused {
        require(_chainId == relayChainId, "invalid chain id");
        (bool success, string memory message, bytes memory logArray) = lightNode.verifyProofDataWithCache(_receiptProof);
        require(success, message);
        _swapInVerified(logArray);
        emit mapSwapExecute(_chainId, selfChainId, msg.sender);
    }

    function swapInWithIndex(uint256 _chainId,uint256 logIndex, bytes memory _receiptProof) external nonReentrant whenNotPaused {
        require(_chainId == relayChainId, "invalid chain id");
        (bool success, string memory message, bytes memory logArray) = lightNode.verifyProofDataWithCache(_receiptProof);
        require(success, message);
        _swapInVerifiedWithIndex(logArray,logIndex);
        emit mapSwapExecute(_chainId, selfChainId, msg.sender);
    }

    function isMintable(address _token) public view returns (bool) {
        return mintableTokens[_token];
    }

    function isBridgeable(address _token, uint256 _toChain) public view returns (bool) {
        return tokenMappingList[_toChain][_token];
    }

    function getOrderStatus(
        uint256,
        uint256 _blockNum,
        bytes32 _orderId
    ) external view override returns (bool exists, bool verifiable, uint256 nodeType) {
        exists = orderList[_orderId];
        verifiable = lightNode.isVerifiable(_blockNum, bytes32(""));
        nodeType = lightNode.nodeType();
    }

    function _getOrderID(address _from, bytes memory _to, uint256 _toChain) internal returns (bytes32) {
        return keccak256(abi.encodePacked(address(this), nonce++, selfChainId, _toChain, _from, _to));
    }

    function _swapInVerified(bytes memory logArray) private {
        IEvent.txLog[] memory logs = EvmDecoder.decodeTxLogs(logArray);
        for (uint256 i = 0; i < logs.length; i++) {
            IEvent.txLog memory log = logs[i];
            _swapIn(log);
        }
    }

    function _swapInVerifiedWithIndex(bytes memory logArray,uint256 logIndex) private {
        IEvent.txLog memory log = EvmDecoder.decodeTxLog(logArray,logIndex);
        _swapIn(log);
    }

    function _swapIn(IEvent.txLog memory log) internal {
        bytes32 topic = abi.decode(log.topics[0], (bytes32));
        if (topic == EvmDecoder.MAP_SWAPOUT_TOPIC && relayContract == log.addr) {
            (, IEvent.swapOutEvent memory outEvent) = EvmDecoder.decodeSwapOutLog(log);
            // there might be more than one events to multi-chains
            // only process the event for this chain
            if (selfChainId == outEvent.toChain) {
                _swapIn(outEvent);
            }
        }
    }

    function _swapIn(IEvent.swapOutEvent memory _outEvent) internal checkOrder(_outEvent.orderId) {
        address tokenIn = Utils.fromBytes(_outEvent.token);
        // receiving address
        address payable toAddress = payable(Utils.fromBytes(_outEvent.to));
        // amount of token need to be sent
        uint256 actualAmountIn = _outEvent.amount;

        if (isMintable(tokenIn)) {
            IMintableToken(tokenIn).mint(address(this), actualAmountIn);
        }

        // if swap params is not empty, then we need to do swap on current chain
        if (_outEvent.swapData.length > 0 && address(toAddress).isContract()) {
            SafeERC20.safeTransfer(IERC20(tokenIn), toAddress, actualAmountIn);
            try
                IButterReceiver(toAddress).onReceived(
                    _outEvent.orderId,
                    tokenIn,
                    actualAmountIn,
                    _outEvent.fromChain,
                    _outEvent.from,
                    _outEvent.swapData
                )
            {
                // do nothing
            } catch {
                // do nothing
            }
        } else {
            // transfer token if swap did not happen
            if (tokenIn == wToken) {
                IWrappedToken(wToken).withdraw(actualAmountIn);
                Address.sendValue(payable(toAddress), actualAmountIn);
            } else {
                SafeERC20.safeTransfer(IERC20(tokenIn), toAddress, actualAmountIn);
            }
        }
        emit mapSwapIn(
            _outEvent.fromChain,
            selfChainId,
            _outEvent.orderId,
            tokenIn,
            _outEvent.from,
            toAddress,
            actualAmountIn
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
        require(_toChain != selfChainId, "Cannot swap to self chain");
        orderId = _getOrderID(msg.sender, _to, _toChain);
        _notifyLightClient(bytes(""));
        emit mapSwapOut(
            selfChainId,
            _toChain,
            orderId,
            Utils.toBytes(_token),
            Utils.toBytes(_from),
            _to,
            _amount,
            _swapData
        );
    }

    function _deposit(address _token, address _from, address _to, uint256 _amount) internal {
        bytes32 orderId = _getOrderID(_from, Utils.toBytes(_to), relayChainId);
        _notifyLightClient(bytes(""));
        emit mapDepositOut(selfChainId, relayChainId, orderId, _token, Utils.toBytes(_from), _to, _amount);
    }

    function _notifyLightClient(bytes memory _data) internal {
        lightNode.notifyLightClient(address(this), _data);
    }

    /** UUPS *********************************************************/
    function _authorizeUpgrade(address) internal view override {
        require(msg.sender == _getAdmin(), "MAPOmnichainService: only Admin can upgrade");
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
